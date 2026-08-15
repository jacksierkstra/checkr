import { Document, Element } from "@xmldom/xmldom";
import {
    AttributeDeclaration,
    AttributeGroupDefinition,
    AttributeUse,
    ComplexTypeDefinition,
    CompiledGrammar,
    CompiledSchema,
    ContentType,
    DerivationMethod,
    ElementDeclaration,
    Facet,
    IdentityConstraintCategory,
    IdentityConstraintDefinition,
    ModelGroup,
    ModelGroupDefinition,
    NamespaceConstraint,
    Particle,
    ParticleTerm,
    QName,
    SimpleTypeDefinition,
    TypeDefinition,
    WhiteSpaceValue,
    Wildcard,
    displayQName,
    qnameEqual,
    qnameKey,
} from "@lib/types/component-graph";
import { deepFreeze } from "@lib/types/immutable";
import { namespaceKey, NAMESPACE_XSD } from "@lib/types/namespaces";
import {
    describeConstraint,
    namespaceConstraintTokenViolation,
    parseNamespaceConstraint,
    processContentsAtLeastAsStrict,
    wildcardAllowsNamespace,
    wildcardIntersection,
    wildcardSubset,
    wildcardUnion,
} from "@lib/xsd/wildcards";
import {
    SchemaCompilationError,
    SchemaError,
    SchemaErrorListener,
    SchemaLocation,
} from "@lib/types/schema-error";
import { childElements, locationOf } from "@lib/xml/dom";
import { XMLParser } from "@lib/xml/parser";
import { BUILTIN_GRAMMAR } from "@lib/xsd/compiler/builtinTypes";
import { computeWhiteSpace, computeEffectiveFacets } from "@lib/xsd/facets";
import { compileXsdRegex, XsdRegexError } from "@lib/xsd/regex";
import { checkUPA, UpaViolation, buildParticleInfo } from "@lib/xsd/content-model";
import {
    IdentityPathError,
    compileField,
    compileSelector,
} from "@lib/xsd/identity-constraints";

export interface CompileOptions {
    listener?: SchemaErrorListener;
    /**
     * Resolves a schemaLocation URI (from xs:include, xs:import, or
     * xs:redefine) to the content of the referenced schema document.
     *
     * Multi-document compilation (CHK-024) requires a resolver; without one,
     * any schemaLocation reference is a compile error. The resolver receives
     * the raw schemaLocation attribute value; relative-URI resolution against
     * the including document's location is the caller's responsibility. Return
     * null (or undefined) when the location cannot be resolved.
     */
    resolve?: (location: string) => string | null;
}

export interface SchemaCompiler {
    compile(xsd: string, options?: CompileOptions): CompiledSchema;
}

/** The per-document defaults that local declarations inherit (XSD 1.0 §3.3.1/§3.4.1). */
interface SchemaDocumentDefaults {
    targetNamespace: string | null;
    elementFormDefault: boolean;
    attributeFormDefault: boolean;
    blockDefault: string;
    finalDefault: string;
    /** The grammar the document's globals register into. */
    grammar: MutableGrammar;
}

interface BuildContext {
    targetNamespace: string | null;
    elementFormDefault: boolean;
    attributeFormDefault: boolean;
    /**
     * The schema's blockDefault (XSD 1.0 §3.3.2), normalized to the token
     * list {extension, restriction, substitution} (an explicit #all expands).
     * Applies to element declarations without an explicit block attribute.
     */
    blockDefault: string;
    /**
     * The schema's finalDefault (XSD 1.0 §3.4.2), normalized with the union
     * of the complex and simple type token sets. Each type kind filters it to
     * its own tokens when it has no explicit final attribute.
     */
    finalDefault: string;
    /** Mutable during pass 1; frozen as part of the final CompiledSchema. */
    grammar: MutableGrammar;
    /**
     * Every grammar being built across the schema document set, keyed by
     * namespace (grammar-per-namespace, AD §4; CHK-024): the root document's
     * grammar plus the grammars of every imported namespace. `grammar` is the
     * grammar the current document registers into; this map is the whole set.
     */
    grammarsByNamespace: Map<string, MutableGrammar>;
    /** Every element declaration built during pass 1, for pass 2 resolution. */
    allElements: ElementDeclaration[];
    /** Every attribute declaration built during pass 1, for pass 2 resolution. */
    allAttributes: AttributeDeclaration[];
    /** Every remaining QName reference (simple-type bases, union members). */
    refs: Array<{ ref: QName; node: Element }>;
    /**
     * Active during the registration of a redefining schema document
     * (xs:redefine, CHK-024): rewrites QName references to a redefined name
     * onto a sentinel key holding the original (pre-redefinition) component,
     * so augmentation references like `base="T"` resolve to the original.
     * Null when no redefine is being registered.
     */
    refRewrite: ((q: QName) => QName) | null;
    /** Every simple type definition built during pass 1, for pass 2 facet resolution. */
    allSimpleTypes: SimpleTypeDefinition[];
    /** Source location of each element declaration, for compile-error reporting. */
    locations: Map<ElementDeclaration, SchemaLocation>;
    /** Source element for each particle, for UPA/constraint error reporting. */
    particleNodes: Map<Particle, Element>;
    /** Every complex type built during pass 1, for post-expansion validation. */
    allComplexTypes: Array<{ type: ComplexTypeDefinition; node: Element }>;
    /** Every model group definition, for post-expansion validation. */
    allModelGroupDefs: Array<{ def: ModelGroupDefinition; node: Element }>;
    /** Every attribute group definition, for post-expansion use-splicing. */
    allAttributeGroupDefs: Array<{ def: AttributeGroupDefinition; node: Element }>;
    /** Source element for each attribute-group-ref placeholder use, for error reporting. */
    attributeGroupRefNodes: Map<AttributeUse, Element>;
    /**
     * Directly referenced attribute-group QNames per owning complex type or
     * attribute group definition, for "complete wildcard" computation (CHK-021).
     */
    attributeGroupWildcardRefs: Map<object, QName[]>;
    /** Derivations recorded for pass 2e/2f/3b (CHK-020). */
    derivations: Array<{
        type: ComplexTypeDefinition;
        ref: QName;
        node: Element;
        method: DerivationMethod;
        form: "simple" | "complex";
        newAttributeUses: ReadonlyArray<AttributeUse>;
        baseResolved: boolean;
        baseKind: "simple" | "complex" | null;
        /** For simpleContent extension/restriction with a pure simple-type base, the resolved simple type. */
        resolvedSimpleType: TypeDefinition | null;
    }>;
    /** Anonymous simple types from simpleContent restrictions (base may be a complex type with simple content, CHK-020). */
    simpleContentRestrictions: Set<SimpleTypeDefinition>;
    /** Every identity constraint definition built during pass 1, for pass 2 resolution. */
    allIdentityConstraints: IdentityConstraintDefinition[];
    /** Every keyref definition that needs its @refer resolved in pass 2. */
    identityConstraintRefs: Array<{ ic: IdentityConstraintDefinition; node: Element }>;
    report: (error: SchemaError) => void;
}

/** Limit constant for `unbounded`. */
const UNBOUNDED = "unbounded";

/** Legal tokens of an element declaration's block attribute (XSD 1.0 §3.3.2). */
const BLOCK_TOKENS = ["extension", "restriction", "substitution"];

/** Legal tokens of a complex type's final attribute (XSD 1.0 §3.4.2). */
const COMPLEX_FINAL_TOKENS = ["extension", "restriction"];

/** Legal tokens of a simple type's final attribute (XSD 1.0 Part 2 §3.3.2). */
const SIMPLE_FINAL_TOKENS = ["list", "union", "restriction"];

/**
 * The four component kinds that can be redefined in XSD 1.0 (§4.2.3), mapped
 * to the grammar map they live in. Notation redefinition is an XSD 1.1 feature.
 */
type RedefineCategory = {
    kind: "complexType" | "simpleType" | "group" | "attributeGroup";
    mapName: "types" | "modelGroups" | "attributeGroups";
};

const REDEFINE_CATEGORIES: Record<string, RedefineCategory> = {
    complexType: { kind: "complexType", mapName: "types" },
    simpleType: { kind: "simpleType", mapName: "types" },
    group: { kind: "group", mapName: "modelGroups" },
    attributeGroup: { kind: "attributeGroup", mapName: "attributeGroups" },
};

function redefineCategory(localName: string | null): RedefineCategory | null {
    return localName ? (REDEFINE_CATEGORIES[localName] ?? null) : null;
}

interface MutableGrammar {
    namespaceURI: string | null;
    elements: Map<string, ElementDeclaration>;
    attributes: Map<string, AttributeDeclaration>;
    types: Map<string, TypeDefinition>;
    modelGroups: Map<string, ModelGroupDefinition>;
    attributeGroups: Map<string, AttributeGroupDefinition>;
    identityConstraints: Map<string, IdentityConstraintDefinition>;
    substitutionGroups: Map<string, ElementDeclaration[]>;
}

/**
 * Compiles an XSD document string into an immutable `CompiledSchema`.
 *
 * Phase 1 parses the document and registers every global component in its
 * target-namespace grammar (AD §4). Phase 2 resolves every QName reference
 * eagerly across the grammars (AD §5): a reference that resolves to nothing is
 * a compile-time error reported through the listener, and compilation throws
 * `SchemaCompilationError` carrying the full error list.
 */
export class SchemaCompilerImpl implements SchemaCompiler {
    constructor(private xmlParser: XMLParser) {}

    compile(xsd: string, options: CompileOptions = {}): CompiledSchema {
        const errors: SchemaError[] = [];
        const listener = options.listener;
        const report = (error: SchemaError) => {
            errors.push(error);
            listener?.(error);
        };
        const root = this.parseSchemaRoot(xsd, report);
        if (!root) throw new SchemaCompilationError(errors);

        if (root.namespaceURI !== NAMESPACE_XSD || root.localName !== "schema") {
            report({
                severity: "fatal",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: "The document root must be an xs:schema element.",
                location: locationOf(root),
                phase: "schema-compilation",
            });
            throw new SchemaCompilationError(errors);
        }

        const rootNamespace = root.getAttribute("targetNamespace") || null;
        const rootGrammar: MutableGrammar = {
            namespaceURI: rootNamespace,
            elements: new Map(),
            attributes: new Map(),
            types: new Map(),
            modelGroups: new Map(),
            attributeGroups: new Map(),
            identityConstraints: new Map(),
            substitutionGroups: new Map(),
        };
        const ctx: BuildContext = {
            targetNamespace: rootNamespace,
            elementFormDefault: root.getAttribute("elementFormDefault") === "qualified",
            attributeFormDefault: root.getAttribute("attributeFormDefault") === "qualified",
            blockDefault: this.normalizeTokens(root.getAttribute("blockDefault"), "", BLOCK_TOKENS),
            finalDefault: this.normalizeTokens(root.getAttribute("finalDefault"), "", [...COMPLEX_FINAL_TOKENS, ...SIMPLE_FINAL_TOKENS]),
            grammar: rootGrammar,
            grammarsByNamespace: new Map([[namespaceKey(rootNamespace), rootGrammar]]),
            refRewrite: null,
            allElements: [],
            allAttributes: [],
            refs: [],
            allSimpleTypes: [],
            allComplexTypes: [],
            allModelGroupDefs: [],
            allAttributeGroupDefs: [],
            derivations: [],
            simpleContentRestrictions: new Set(),
            locations: new Map(),
            particleNodes: new Map(),
            attributeGroupRefNodes: new Map(),
            attributeGroupWildcardRefs: new Map(),
            allIdentityConstraints: [],
            identityConstraintRefs: [],
            report,
        };

        // Pass 1 — assemble the schema document set (include/import/redefine,
        // CHK-024) and register every global component into its target-namespace
        // grammar (AD §4). Pass 1a of compile() resolves multi-document sources
        // through the resolver; registerSchemaSet owns the whole source graph.
        this.registerSchemaSet(ctx, root, options);

        const grammars = new Map<string, CompiledGrammar>();
        grammars.set(NAMESPACE_XSD, BUILTIN_GRAMMAR);
        for (const [key, grammar] of ctx.grammarsByNamespace) {
            grammars.set(key, grammar);
        }

        // Pass 2 — eager multi-pass reference resolution (AD §5).
        this.resolveReferencePass(ctx, grammars);

        // Pass 2a.5 — resolve substitution group affiliations and build the
        // transitive member sets per head (XSD 1.0 §3.3.6, CHK-023).
        this.buildSubstitutionGroups(ctx, grammars);

        // Pass 2c — expand named model group references into particles (CHK-019).
        this.expandModelGroups(ctx, grammars);

        // Pass 2d — expand attribute group references into attribute uses (CHK-019).
        this.expandAttributeGroups(ctx, grammars);

        // Pass 2d.5 — compute every attribute group's and complex type's
        // "complete wildcard" from local <xs:anyAttribute> + referenced attribute
        // groups (CHK-021). Must run after expansion so group refs are spliced.
        this.resolveAttributeWildcards(ctx, grammars);

        // Pass 2e — resolve the base type definitions of complex/simple content
        // derivations (complexContent/simpleContent extension & restriction, CHK-020).
        this.resolveDerivationBases(ctx, grammars);

        // Pass 2f — compute the effective content of derived complex types
        // (extension splices the base particle + new particle; simpleContent
        // extension inherits the base's simple type), base-first (CHK-020).
        this.computeDerivedContent(ctx);

        // Pass 3 — resolve simple-type bases and compute effective facets/whiteSpace.
        this.resolveSimpleTypes(ctx, grammars);

        // Pass 3b — validate derivations against the spec's extension/restriction
        // rules (including the CTR-all-compile policy), after simple-type bases
        // and all type references are resolved (CHK-020).
        this.validateDerivations(ctx);

        // Pass 4 — UPA determinism and all-group constraints on the expanded content.
        this.checkContentModels(ctx);

        if (errors.some((e) => e.severity === "error" || e.severity === "fatal")) {
            throw new SchemaCompilationError(errors);
        }
        return deepFreeze<CompiledSchema>({ grammars });
    }

    // -----------------------------------------------------------------------
    // Pass 1 — multi-document schema assembly (CHK-024)
    // -----------------------------------------------------------------------

    /** Get-or-create the mutable grammar for a namespace across the schema set. */
    private getOrCreateGrammar(ctx: BuildContext, namespaceURI: string | null): MutableGrammar {
        const key = namespaceKey(namespaceURI);
        let grammar = ctx.grammarsByNamespace.get(key);
        if (!grammar) {
            grammar = {
                namespaceURI,
                elements: new Map(),
                attributes: new Map(),
                types: new Map(),
                modelGroups: new Map(),
                attributeGroups: new Map(),
                identityConstraints: new Map(),
                substitutionGroups: new Map(),
            };
            ctx.grammarsByNamespace.set(key, grammar);
        }
        return grammar;
    }

    /** Snapshot the per-document defaults so a nested document can be processed and the caller restored. */
    private snapshotDefaults(ctx: BuildContext): SchemaDocumentDefaults {
        return {
            targetNamespace: ctx.targetNamespace,
            elementFormDefault: ctx.elementFormDefault,
            attributeFormDefault: ctx.attributeFormDefault,
            blockDefault: ctx.blockDefault,
            finalDefault: ctx.finalDefault,
            grammar: ctx.grammar,
        };
    }

    /** Restore per-document defaults captured by {@link snapshotDefaults}. */
    private restoreDefaults(ctx: BuildContext, saved: SchemaDocumentDefaults): void {
        ctx.targetNamespace = saved.targetNamespace;
        ctx.elementFormDefault = saved.elementFormDefault;
        ctx.attributeFormDefault = saved.attributeFormDefault;
        ctx.blockDefault = saved.blockDefault;
        ctx.finalDefault = saved.finalDefault;
        ctx.grammar = saved.grammar;
    }

    /**
     * Register one schema document's per-document defaults onto the shared
     * build context (target namespace, forms, defaults) and return its grammar.
     */
    private adoptDocument(ctx: BuildContext, docRoot: Element): MutableGrammar {
        const targetNamespace = docRoot.getAttribute("targetNamespace") || null;
        ctx.targetNamespace = targetNamespace;
        ctx.grammar = this.getOrCreateGrammar(ctx, targetNamespace);
        ctx.elementFormDefault = docRoot.getAttribute("elementFormDefault") === "qualified";
        ctx.attributeFormDefault = docRoot.getAttribute("attributeFormDefault") === "qualified";
        ctx.blockDefault = this.normalizeTokens(docRoot.getAttribute("blockDefault"), "", BLOCK_TOKENS);
        ctx.finalDefault = this.normalizeTokens(docRoot.getAttribute("finalDefault"), "", [...COMPLEX_FINAL_TOKENS, ...SIMPLE_FINAL_TOKENS]);
        return ctx.grammar;
    }

    /**
     * Assemble the multi-document schema set rooted at `root` and register
     * every global component (XSD 1.0 §4.2, CHK-024):
     *
     * - `xs:include` merges a same-namespace document into the including
     *   document's grammar; duplicate component definitions are compile errors.
     * - `xs:import` creates a foreign grammar for the imported namespace;
     *   QName resolution crosses grammars in pass 2.
     * - `xs:redefine` augments components from a same-namespace document:
     *   references to a redefined name inside the redefining document resolve
     *   to the original component; the redefinition replaces it in the set.
     *
     * Locations are tracked for cycle detection; a document whose location has
     * already been processed is not re-processed (its components were already
     * registered, and re-registration would only duplicate them).
     */
    private registerSchemaSet(ctx: BuildContext, root: Element, options: CompileOptions): void {
        const resolve = options.resolve;
        const processed = new Set<string>();
        const processing = new Set<string>();

        /** Resolve a schemaLocation to a parsed schema document, reporting errors. */
        const resolveDocument = (location: string, sourceEl: Element, what: string): Element | null => {
            if (!resolve) {
                ctx.report({
                    severity: "error",
                    code: "SCHEMA_LOCATION_UNRESOLVED",
                    message: `Cannot process ${what} schemaLocation '${location}': no schema resolver is configured (compile option 'resolve').`,
                    location: locationOf(sourceEl),
                    phase: "schema-compilation",
                });
                return null;
            }
            const content = resolve(location);
            if (content === null || content === undefined) {
                ctx.report({
                    severity: "error",
                    code: "SCHEMA_LOCATION_UNRESOLVED",
                    message: `Cannot resolve ${what} schemaLocation '${location}' to a schema document.`,
                    location: locationOf(sourceEl),
                    phase: "schema-compilation",
                });
                return null;
            }
            return this.parseSchemaRoot(content, ctx.report);
        };

        /**
         * Register a schema document and, recursively, everything it includes,
         * imports, or redefines. `expectedNamespace` is the namespace the
         * document must declare as its target namespace per the including
         * construct; `undefined` means no constraint (the root document).
         */
        const registerDoc = (
            docRoot: Element,
            location: string | null,
            expectedNamespace: string | null | undefined,
            via: "root" | "include" | "import" | "redefine",
            sourceEl: Element | null,
        ): void => {
            if (location !== null) {
                if (processing.has(location)) {
                    ctx.report({
                        severity: "error",
                        code: "CIRCULAR_REFERENCE",
                        message: `Circular schema document reference: '${location}' includes, imports, or redefines itself (directly or transitively).`,
                        location: sourceEl ? locationOf(sourceEl) : { line: 0, column: 0 },
                        phase: "schema-compilation",
                    });
                    return;
                }
                if (processed.has(location)) return;
                processing.add(location);
            }

            const targetNamespace = docRoot.getAttribute("targetNamespace") || null;
            if (expectedNamespace !== undefined && targetNamespace !== expectedNamespace) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `A ${via === "import" ? "imported" : via === "redefine" ? "redefined" : "included"} schema document ${location ? `('${location}') ` : ""}must have the same target namespace as the ${via === "import" ? "import declaration" : "including document"} (expected ${expectedNamespace === null ? "(none)" : `'${expectedNamespace}'`}, found ${targetNamespace === null ? "(none)" : `'${targetNamespace}'`}).`,
                    location: sourceEl ? locationOf(sourceEl) : { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            }

            const saved = this.snapshotDefaults(ctx);
            this.adoptDocument(ctx, docRoot);

            // Phase A — register the documents this document redefines first, so
            // the originals exist before any references are read (redefinition
            // references resolve against the original, XSD 1.0 §4.2.3).
            const redefineEls: Element[] = [];
            for (const child of childElements(docRoot)) {
                if (child.namespaceURI !== NAMESPACE_XSD) continue;
                if (child.localName !== "redefine") continue;
                redefineEls.push(child);
                const loc = child.getAttribute("schemaLocation");
                if (!loc) {
                    ctx.report({
                        severity: "error",
                        code: "INVALID_SCHEMA_DOCUMENT",
                        message: "An xs:redefine element must carry a schemaLocation attribute.",
                        location: locationOf(child),
                        phase: "schema-compilation",
                    });
                    continue;
                }
                const redefined = resolveDocument(loc, child, "redefine");
                if (!redefined) continue;
                // The redefined document shares this document's grammar (same
                // target namespace) but has its own defaults; the recursive call
                // adopts and restores them.
                registerDoc(redefined, loc, ctx.targetNamespace, "redefine", child);
            }

            // Phase B — register this document's globals. While the redefined
            // names are in scope, QName references to them are rewritten to
            // sentinel keys holding the original components.
            const redefinedNames = new Map<string, { category: RedefineCategory; sentinel: string }>();
            const invalidRedefinitions = new Set<string>();
            for (const redefineEl of redefineEls) {
                for (const rdChild of childElements(redefineEl)) {
                    if (rdChild.namespaceURI !== NAMESPACE_XSD) continue;
                    const category = redefineCategory(rdChild.localName);
                    if (!category) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_SCHEMA_DOCUMENT",
                            message: `Only complexType, simpleType, group, and attributeGroup can be redefined in XSD 1.0; xs:${rdChild.localName ?? "?"} cannot be redefined.`,
                            location: locationOf(rdChild),
                            phase: "schema-compilation",
                        });
                        continue;
                    }
                    const name = rdChild.getAttribute("name");
                    if (!name) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_SCHEMA_DOCUMENT",
                            message: `A redefinition must carry a name attribute.`,
                            location: locationOf(rdChild),
                            phase: "schema-compilation",
                        });
                        continue;
                    }
                    if (redefinedNames.has(name)) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_SCHEMA_DOCUMENT",
                            message: `Component '${name}' is redefined more than once; a component can only be redefined a single time.`,
                            location: locationOf(rdChild),
                            phase: "schema-compilation",
                        });
                        invalidRedefinitions.add(name);
                        continue;
                    }
                    const original = (ctx.grammar[category.mapName] as Map<string, unknown>).get(name);
                    if (!original) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_SCHEMA_DOCUMENT",
                            message: `Cannot redefine '${name}': it is not defined by the redefined schema document.`,
                            location: locationOf(rdChild),
                            phase: "schema-compilation",
                        });
                        invalidRedefinitions.add(name);
                        continue;
                    }
                    const sentinel = `__checkr_redefine_${name}`;
                    (ctx.grammar[category.mapName] as Map<string, unknown>).set(sentinel, original);
                    redefinedNames.set(name, { category, sentinel });
                }
            }
            // Phase B — register this document's globals. References from the
            // redefining document's own definitions (outside the redefine
            // element) resolve to the redefined (replacement) components, which
            // is the XSD 1.0 §4.2.3 behavior: only the redefine element's
            // children (built in Phase C) see the originals via the sentinel.
            this.registerGlobals(docRoot, ctx);

            // Phase C — build the redefinitions (references to the redefined
            // name still resolve to the original via the sentinel) and replace
            // the original components in the grammar.
            if (redefinedNames.size > 0) {
                ctx.refRewrite = (q: QName): QName => {
                    const entry = redefinedNames.get(q.localName);
                    if (entry && (q.namespaceURI ?? null) === (ctx.targetNamespace ?? null)) {
                        return { namespaceURI: q.namespaceURI, localName: entry.sentinel };
                    }
                    return q;
                };
            }
            for (const redefineEl of redefineEls) {
                for (const rdChild of childElements(redefineEl)) {
                    if (rdChild.namespaceURI !== NAMESPACE_XSD) continue;
                    const name = rdChild.getAttribute("name") ?? "";
                    if (!name) continue;
                    if (invalidRedefinitions.has(name)) continue;
                    const entry = redefinedNames.get(name);
                    if (!entry) continue;
                    this.buildRedefinition(rdChild, name, entry.category, ctx);
                }
            }
            ctx.refRewrite = null;

            // Phase D — discover this document's includes and imports.
            for (const child of childElements(docRoot)) {
                if (child.namespaceURI !== NAMESPACE_XSD) continue;
                if (child.localName === "include") {
                    const loc = child.getAttribute("schemaLocation");
                    if (!loc) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_SCHEMA_DOCUMENT",
                            message: "An xs:include element must carry a schemaLocation attribute.",
                            location: locationOf(child),
                            phase: "schema-compilation",
                        });
                        continue;
                    }
                    const included = resolveDocument(loc, child, "include");
                    if (!included) continue;
                    registerDoc(included, loc, ctx.targetNamespace, "include", child);
                } else if (child.localName === "import") {
                    // The namespace attribute may be absent (importing the
                    // no-namespace schema); schemaLocation is optional (a
                    // locationless import contributes no grammar and simply
                    // declares intent).
                    const importedNs = child.getAttribute("namespace") || null;
                    if (importedNs !== null && importedNs === ctx.targetNamespace) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_SCHEMA_DOCUMENT",
                            message: "An xs:import cannot import the schema document's own target namespace; use xs:include instead.",
                            location: locationOf(child),
                            phase: "schema-compilation",
                        });
                        continue;
                    }
                    const loc = child.getAttribute("schemaLocation");
                    if (!loc) continue;
                    const imported = resolveDocument(loc, child, "import");
                    if (!imported) continue;
                    registerDoc(imported, loc, importedNs, "import", child);
                }
            }

            this.restoreDefaults(ctx, saved);
            if (location !== null) {
                processing.delete(location);
                processed.add(location);
            }
        };

        registerDoc(root, null, undefined, "root", null);
    }

    /**
     * Register the global component definitions of one schema document into
     * its target-namespace grammar, with duplicate-component detection (two
     * schema documents may not define the same component, XSD 1.0 §4.2.1).
     */
    private registerGlobals(docRoot: Element, ctx: BuildContext): void {
        for (const child of childElements(docRoot)) {
            if (child.namespaceURI !== NAMESPACE_XSD) continue;
            switch (child.localName) {
                case "element": {
                    const decl = this.buildGlobalElement(child, ctx);
                    this.registerComponent(ctx, "elements", decl.name.localName, decl, "element", child);
                    break;
                }
                case "attribute": {
                    const decl = this.buildGlobalAttribute(child, ctx);
                    if (decl) this.registerComponent(ctx, "attributes", decl.name.localName, decl, "attribute", child);
                    break;
                }
                case "complexType": {
                    const type = this.buildComplexType(child, ctx, ctx.targetNamespace);
                    if (type.name) this.registerComponent(ctx, "types", type.name.localName, type, "complexType", child);
                    break;
                }
                case "simpleType": {
                    const type = this.buildSimpleType(child, ctx, ctx.targetNamespace);
                    if (type.name) this.registerComponent(ctx, "types", type.name.localName, type, "simpleType", child);
                    break;
                }
                case "group": {
                    const def = this.buildModelGroupDefinition(child, ctx);
                    if (def) this.registerComponent(ctx, "modelGroups", def.name.localName, def, "group", child);
                    break;
                }
                case "attributeGroup": {
                    const def = this.buildAttributeGroupDefinition(child, ctx);
                    if (def) this.registerComponent(ctx, "attributeGroups", def.name.localName, def, "attributeGroup", child);
                    break;
                }
                // include/import/redefine handled by registerSchemaSet;
                // annotation/notation are later tickets.
            }
        }
    }

    /** Register one global component, rejecting duplicate definitions. */
    private registerComponent(
        ctx: BuildContext,
        mapName: "elements" | "attributes" | "types" | "modelGroups" | "attributeGroups",
        localName: string,
        component: unknown,
        kind: string,
        el: Element,
    ): void {
        const map = ctx.grammar[mapName] as Map<string, unknown>;
        if (map.has(localName)) {
            ctx.report({
                severity: "error",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: `Duplicate definition of ${kind} '${localName}' in namespace ${ctx.targetNamespace === null ? "(none)" : `'${ctx.targetNamespace}'`}; a schema document set may only define a component once.`,
                location: locationOf(el),
                phase: "schema-compilation",
            });
            return;
        }
        map.set(localName, component);
    }

    /**
     * Build a single redefinition (xs:complexType/xs:simpleType/xs:group/
     * xs:attributeGroup inside an xs:redefine element) and replace the
     * original component in the grammar (XSD 1.0 §4.2.3).
     */
    private buildRedefinition(
        el: Element,
        name: string,
        category: RedefineCategory,
        ctx: BuildContext,
    ): void {
        const grammar = ctx.grammar[category.mapName] as Map<string, unknown>;
        let replacement: unknown = null;
        switch (category.kind) {
            case "complexType":
                replacement = this.buildComplexType(el, ctx, ctx.targetNamespace);
                break;
            case "simpleType":
                replacement = this.buildSimpleType(el, ctx, ctx.targetNamespace);
                break;
            case "group":
                replacement = this.buildModelGroupDefinition(el, ctx);
                break;
            case "attributeGroup":
                replacement = this.buildAttributeGroupDefinition(el, ctx);
                break;
        }
        if (replacement) grammar.set(name, replacement);
    }

    // -----------------------------------------------------------------------
    // Pass 1 — builders
    // -----------------------------------------------------------------------

    private buildGlobalElement(el: Element, ctx: BuildContext): ElementDeclaration {
        const localName = el.getAttribute("name") ?? "";
        if (!localName) {
            ctx.report({
                severity: "fatal",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: "A global xs:element must carry a name.",
                location: locationOf(el),
                phase: "schema-compilation",
            });
        }
        const name: QName = { namespaceURI: ctx.targetNamespace, localName };
        const typeRef = this.readQName(el, "type", ctx);
        const inlineType = typeRef ? null : this.buildInlineType(el, ctx);
        const decl: ElementDeclaration = {
            kind: "element",
            scope: "global",
            name,
            typeRef,
            type: inlineType,
            nillable: el.getAttribute("nillable") === "true",
            ref: null,
            identityConstraints: this.buildIdentityConstraints(el, ctx),
            substitutionGroup: this.readQName(el, "substitutionGroup", ctx),
            abstract: el.getAttribute("abstract") === "true",
            default: el.getAttribute("default") ?? null,
            fixed: el.getAttribute("fixed") ?? null,
            block: this.normalizeTokens(el.getAttribute("block"), ctx.blockDefault, BLOCK_TOKENS),
        };
        this.checkValueConstraint(decl, el, ctx);
        ctx.locations.set(decl, locationOf(el));
        ctx.allElements.push(decl);
        return decl;
    }

    private buildGlobalAttribute(el: Element, ctx: BuildContext): AttributeDeclaration | null {
        const localName = el.getAttribute("name") ?? "";
        if (!localName) {
            ctx.report({
                severity: "fatal",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: "A global xs:attribute must carry a name.",
                location: locationOf(el),
                phase: "schema-compilation",
            });
            return null;
        }
        const decl: AttributeDeclaration = {
            kind: "attribute",
            name: { namespaceURI: ctx.targetNamespace, localName },
            typeRef: this.readQName(el, "type", ctx),
            type: null,
            ref: null,
        };
        ctx.allAttributes.push(decl);
        return decl;
    }

    private buildComplexType(el: Element, ctx: BuildContext, declaredNs: string | null): ComplexTypeDefinition {
        const nameAttr = el.getAttribute("name");
        const name: QName | null = nameAttr ? { namespaceURI: declaredNs, localName: nameAttr } : null;
        const mixed = el.getAttribute("mixed") === "true";

        let particle: Particle | null = null;
        let contentType: ContentType = "empty";
        let simpleType: SimpleTypeDefinition | null = null;
        let derivationMethod: DerivationMethod | null = null;
        let baseRef: QName | null = null;
        let derivationNode: Element | null = null;
        // The element whose children carry the type's attribute uses:
        // the xs:complexType itself for plain content, or the extension/
        // restriction element for simpleContent/complexContent (CHK-020).
        let attributeParent: Element = el;

        const contentChild = childElements(el).find(
            (c) => c.namespaceURI === NAMESPACE_XSD &&
                ["sequence", "choice", "all", "any", "simpleContent", "complexContent"].includes(c.localName ?? "")
        );
        if (contentChild) {
            switch (contentChild.localName) {
                case "sequence":
                case "choice":
                case "all":
                    particle = this.wrapParticle(ctx, contentChild, this.buildModelGroup(contentChild, ctx));
                    contentType = mixed ? "mixed" : "element-only";
                    if (contentChild.localName === "all") {
                        this.validateAllGroup(ctx, particle, contentChild);
                    }
                    break;
                case "any":
                    particle = this.buildAnyParticle(contentChild, ctx);
                    contentType = mixed ? "mixed" : "element-only";
                    break;
                case "simpleContent": {
                    const derivation = childElements(contentChild).find(
                        (c) => c.namespaceURI === NAMESPACE_XSD &&
                            (c.localName === "extension" || c.localName === "restriction")
                    );
                    if (!derivation) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_SCHEMA_DOCUMENT",
                            message: "An xs:simpleContent element must contain exactly one xs:extension or xs:restriction element.",
                            location: locationOf(contentChild),
                            phase: "schema-compilation",
                        });
                        break;
                    }
                    attributeParent = derivation;
                    derivationNode = derivation;
                    baseRef = this.readQName(derivation, "base", ctx);
                    if (baseRef) this.trackRef(ctx, derivation, baseRef);
                    derivationMethod = derivation.localName === "extension" ? "extension" : "restriction";
                    contentType = "simple";
                    if (derivationMethod === "restriction") {
                        simpleType = this.buildSimpleContentRestriction(derivation, ctx);
                    }
                    break;
                }
                case "complexContent": {
                    const derivation = childElements(contentChild).find(
                        (c) => c.namespaceURI === NAMESPACE_XSD &&
                            (c.localName === "extension" || c.localName === "restriction")
                    );
                    if (!derivation) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_SCHEMA_DOCUMENT",
                            message: "An xs:complexContent element must contain exactly one xs:extension or xs:restriction element.",
                            location: locationOf(contentChild),
                            phase: "schema-compilation",
                        });
                        break;
                    }
                    attributeParent = derivation;
                    derivationNode = derivation;
                    baseRef = this.readQName(derivation, "base", ctx);
                    if (baseRef) this.trackRef(ctx, derivation, baseRef);
                    derivationMethod = derivation.localName === "extension" ? "extension" : "restriction";
                    // The derivation's own content particle (extension splices
                    // onto the base in pass 2f; restriction keeps its own).
                    const compositor = childElements(derivation).find(
                        (c) => c.namespaceURI === NAMESPACE_XSD &&
                            (c.localName === "sequence" || c.localName === "choice" || c.localName === "all")
                    );
                    if (compositor) {
                        particle = this.wrapParticle(ctx, compositor, this.buildModelGroup(compositor, ctx));
                        if (compositor.localName === "all") {
                            this.validateAllGroup(ctx, particle, compositor);
                        }
                    }
                    // The mixed flag comes from xs:complexContent when present,
                    // else from the xs:complexType element. Final content type
                    // is adjusted from the base's content in pass 2f.
                    const ccMixed = contentChild.getAttribute("mixed");
                    const effectiveMixed = ccMixed !== null ? ccMixed === "true" : mixed;
                    contentType = effectiveMixed ? "mixed" : "element-only";
                    break;
                }
                default:
                    break;
            }
        } else if (mixed) {
            // mixed="true" with no compositor: mixed content over an empty
            // particle (character data allowed, no element children).
            contentType = "mixed";
        }

        const usesResult = this.readComplexTypeUses(attributeParent, ctx);
        const attributeUses = usesResult.uses;

        const result: ComplexTypeDefinition = {
            kind: "complex-type",
            name,
            contentType,
            particle,
            attributeUses,
            simpleType,
            baseType: null,
            derivationMethod,
            // The local wildcard from <xs:anyAttribute>; pass 2d.5 computes the
            // complete wildcard (intersection with referenced attribute groups)
            // and pass 2f unions it with the base for extensions (CHK-021).
            attributeWildcard: usesResult.wildcard,
            isAbstract: el.getAttribute("abstract") === "true",
            final: this.finalForComplexType(el, ctx),
        };
        if (usesResult.groupRefs.length > 0) {
            ctx.attributeGroupWildcardRefs.set(result, usesResult.groupRefs);
        }
        ctx.allComplexTypes.push({ type: result, node: el });
        if (baseRef && derivationMethod && derivationNode) {
            ctx.derivations.push({
                type: result,
                ref: baseRef,
                node: derivationNode,
                method: derivationMethod,
                form: contentChild?.localName === "simpleContent" ? "simple" : "complex",
                newAttributeUses: attributeUses,
                baseResolved: false,
                baseKind: null,
                resolvedSimpleType: null,
            });
        }
        return result;
    }

    private buildSimpleType(el: Element, ctx: BuildContext, declaredNs: string | null): SimpleTypeDefinition {
        const nameAttr = el.getAttribute("name");
        const name: QName | null = nameAttr ? { namespaceURI: declaredNs, localName: nameAttr } : null;

        const derivation = childElements(el).find(
            (c) => c.namespaceURI === NAMESPACE_XSD && (c.localName === "restriction" || c.localName === "list" || c.localName === "union")
        );
        if (!derivation) {
            const st: SimpleTypeDefinition = {
                kind: "simple-type", name, variety: "atomic",
                itemType: null, memberTypes: [], itemTypeDef: null, memberTypeDefs: [], facets: [],
                baseType: null, whiteSpace: "preserve", effectiveFacets: [],
                final: "",
            };
            ctx.allSimpleTypes.push(st);
            return st;
        }

        let result: SimpleTypeDefinition;
        switch (derivation.localName) {
            case "restriction": {
                const base = this.readQName(derivation, "base", ctx);
                if (base) this.trackRef(ctx, derivation, base);
                result = {
                    kind: "simple-type",
                    name,
                    variety: "atomic",
                    itemType: base,
                    memberTypes: [],
                    itemTypeDef: null,
                    memberTypeDefs: [],
                    facets: this.readFacets(derivation),
                    baseType: null,
                    whiteSpace: "preserve",
                    effectiveFacets: [],
                    final: this.finalForSimpleType(el, ctx),
                };
                this.checkPatternFacets(this.readFacets(derivation), ctx);
                break;
            }
            case "list": {
                const itemType = this.readQName(derivation, "itemType", ctx);
                if (itemType) this.trackRef(ctx, derivation, itemType);
                // Inline anonymous item type (XSD 1.0 Part 2 §3.4.1): allowed
                // only when there is no itemType attribute. Build it either way
                // so its references still get resolved/checked; the attribute
                // wins as the item type when both are present.
                let itemTypeDef: SimpleTypeDefinition | null = null;
                const inlineItem = childElements(derivation).find(
                    (c) => c.namespaceURI === NAMESPACE_XSD && c.localName === "simpleType"
                );
                if (inlineItem && !itemType) {
                    itemTypeDef = this.buildSimpleType(inlineItem, ctx, null);
                }
                result = {
                    kind: "simple-type", name, variety: "list",
                    itemType, memberTypes: [], itemTypeDef, memberTypeDefs: [], facets: [],
                    baseType: null, whiteSpace: "collapse", effectiveFacets: [],
                    final: this.finalForSimpleType(el, ctx),
                };
                break;
            }
            case "union": {
                const memberTypes: QName[] = [];
                const raw = derivation.getAttribute("memberTypes");
                if (raw) {
                    for (const part of raw.trim().split(/\s+/)) {
                        const member = this.readQNameString(derivation, part, ctx);
                        if (member) {
                            memberTypes.push(member);
                            this.trackRef(ctx, derivation, member);
                        }
                    }
                }
                // Inline anonymous member types follow the memberTypes
                // attribute members in document order (XSD 1.0 Part 2 §3.4.2).
                const memberTypeDefs: SimpleTypeDefinition[] = [];
                for (const c of childElements(derivation)) {
                    if (c.namespaceURI === NAMESPACE_XSD && c.localName === "simpleType") {
                        memberTypeDefs.push(this.buildSimpleType(c, ctx, null));
                    }
                }
                result = {
                    kind: "simple-type", name, variety: "union",
                    itemType: null, memberTypes, itemTypeDef: null, memberTypeDefs, facets: [],
                    baseType: null, whiteSpace: "preserve", effectiveFacets: [],
                    final: this.finalForSimpleType(el, ctx),
                };
                break;
            }
            default:
                result = {
                    kind: "simple-type", name, variety: "atomic",
                    itemType: null, memberTypes: [], itemTypeDef: null, memberTypeDefs: [], facets: [],
                    baseType: null, whiteSpace: "preserve", effectiveFacets: [],
                    final: "",
                };
                break;
        }
        ctx.allSimpleTypes.push(result);
        return result;
    }

    private buildInlineType(el: Element, ctx: BuildContext): TypeDefinition | null {
        for (const child of childElements(el)) {
            if (child.namespaceURI !== NAMESPACE_XSD) continue;
            if (child.localName === "complexType") return this.buildComplexType(child, ctx, null);
            if (child.localName === "simpleType") return this.buildSimpleType(child, ctx, null);
        }
        return null;
    }

    /**
     * The anonymous simple type of a `<xs:simpleContent><xs:restriction …>`
     * derivation. Its base (itemType) may be a plain simple type or a complex
     * type with simple content (resolved in pass 3 / pass 2e+2f, CHK-020).
     */
    private buildSimpleContentRestriction(el: Element, ctx: BuildContext): SimpleTypeDefinition {
        const base = this.readQName(el, "base", ctx);
        const facets = this.readFacets(el);
        this.checkPatternFacets(facets, ctx);
        const st: SimpleTypeDefinition = {
            kind: "simple-type",
            name: null,
            variety: "atomic",
            itemType: base,
            memberTypes: [],
            itemTypeDef: null,
            memberTypeDefs: [],
            facets,
            baseType: null,
            whiteSpace: "preserve",
            effectiveFacets: [],
            final: "",
        };
        if (base) ctx.simpleContentRestrictions.add(st);
        ctx.allSimpleTypes.push(st);
        return st;
    }

    /**
     * Parse attribute use children from an element (the xs:complexType element
     * itself for plain content, or the extension/restriction element for
     * simpleContent/complexContent derivations, CHK-020). Also collects the
     * local `<xs:anyAttribute>` wildcard and the directly referenced attribute
     * groups for "complete wildcard" computation (CHK-021).
     */
    private readComplexTypeUses(el: Element, ctx: BuildContext): {
        uses: AttributeUse[];
        wildcard: Wildcard | null;
        groupRefs: QName[];
    } {
        const uses: AttributeUse[] = [];
        let wildcard: Wildcard | null = null;
        const groupRefs: QName[] = [];
        for (const child of childElements(el)) {
            if (child.namespaceURI !== NAMESPACE_XSD) continue;
            if (child.localName === "attribute") {
                const use = this.buildAttributeUse(child, ctx);
                if (use) uses.push(use);
            } else if (child.localName === "attributeGroup") {
                const ref = this.readQName(child, "ref", ctx);
                if (ref) {
                    groupRefs.push(ref);
                    const placeholder = this.placeholderAttributeGroupUse(child, ref);
                    ctx.attributeGroupRefNodes.set(placeholder, child);
                    uses.push(placeholder);
                } else {
                    ctx.report({
                        severity: "error",
                        code: "INVALID_SCHEMA_DOCUMENT",
                        message: "An xs:attributeGroup reference must carry a ref attribute.",
                        location: locationOf(child),
                        phase: "schema-compilation",
                    });
                }
            } else if (child.localName === "anyAttribute") {
                wildcard = this.buildWildcard(child, ctx);
            }
        }
        return { uses, wildcard, groupRefs };
    }

    private buildModelGroup(el: Element, ctx: BuildContext): ModelGroup {
        const particles: Particle[] = [];
        for (const child of childElements(el)) {
            if (child.namespaceURI !== NAMESPACE_XSD) continue;
            switch (child.localName) {
                case "element":
                    particles.push(this.buildLocalElementParticle(child, ctx));
                    break;
                case "sequence":
                case "choice":
                case "all":
                    particles.push(this.wrapParticle(ctx, child, this.buildModelGroup(child, ctx)));
                    break;
                case "any":
                    particles.push(this.buildAnyParticle(child, ctx));
                    break;
                case "group": {
                    const ref = this.readQName(child, "ref", ctx);
                    if (ref) {
                        // A placeholder group; pass 2 replaces its content with the
                        // referenced definition's particles (CHK-019).
                        particles.push(this.wrapParticle(ctx, child, { kind: "sequence", particles: [], ref }));
                    } else {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_SCHEMA_DOCUMENT",
                            message: "A nested xs:group must carry a ref attribute.",
                            location: locationOf(child),
                            phase: "schema-compilation",
                        });
                    }
                    break;
                }
                default:
                    break; // annotation
            }
        }
        return { kind: el.localName as "sequence" | "choice" | "all", particles, ref: null };
    }

    private buildModelGroupDefinition(el: Element, ctx: BuildContext): ModelGroupDefinition | null {
        const localName = el.getAttribute("name") ?? "";
        if (!localName) {
            ctx.report({
                severity: "fatal",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: "A global xs:group must carry a name.",
                location: locationOf(el),
                phase: "schema-compilation",
            });
            return null;
        }
        const compositor = childElements(el).find(
            (c) => c.namespaceURI === NAMESPACE_XSD &&
                (c.localName === "sequence" || c.localName === "choice" || c.localName === "all")
        );
        if (!compositor) {
            ctx.report({
                severity: "error",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: `A global xs:group (${localName}) must contain a sequence, choice, or all compositor.`,
                location: locationOf(el),
                phase: "schema-compilation",
            });
            return null;
        }
        const particle = this.wrapParticle(ctx, compositor, this.buildModelGroup(compositor, ctx));
        if (compositor.localName === "all") {
            this.validateAllGroup(ctx, particle, compositor);
        }
        const def: ModelGroupDefinition = {
            kind: "model-group-definition",
            name: { namespaceURI: ctx.targetNamespace, localName },
            particle,
        };
        ctx.allModelGroupDefs.push({ def, node: el });
        return def;
    }

    private buildAttributeGroupDefinition(el: Element, ctx: BuildContext): AttributeGroupDefinition | null {
        const localName = el.getAttribute("name") ?? "";
        if (!localName) {
            ctx.report({
                severity: "fatal",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: "A global xs:attributeGroup must carry a name.",
                location: locationOf(el),
                phase: "schema-compilation",
            });
            return null;
        }
        const usesResult = this.readComplexTypeUses(el, ctx);
        const def: AttributeGroupDefinition = {
            kind: "attribute-group-definition",
            name: { namespaceURI: ctx.targetNamespace, localName },
            attributeUses: usesResult.uses,
            attributeWildcard: usesResult.wildcard,
        };
        if (usesResult.groupRefs.length > 0) {
            ctx.attributeGroupWildcardRefs.set(def, usesResult.groupRefs);
        }
        ctx.allAttributeGroupDefs.push({ def, node: el });
        return def;
    }

    /** A placeholder attribute use marking `<xs:attributeGroup ref="…">`; pass 2 splices the referenced uses. */
    private placeholderAttributeGroupUse(el: Element, ref: QName): AttributeUse {
        return {
            declaration: {
                kind: "attribute",
                name: { namespaceURI: ref.namespaceURI, localName: ref.localName },
                typeRef: null,
                type: null,
                ref: null,
            },
            required: false,
            fixed: null,
            defaultValue: null,
            attributeGroupRef: ref,
        };
    }

    private buildLocalElementParticle(el: Element, ctx: BuildContext): Particle {
        const refAttr = this.readQName(el, "ref", ctx);
        const typeRef = refAttr ? null : this.readQName(el, "type", ctx);
        const inlineType = refAttr || typeRef ? null : this.buildInlineType(el, ctx);
        const decl: ElementDeclaration = {
            kind: "element",
            scope: "local",
            // A ref particle's identity is the referenced QName; its type is
            // resolved in pass 2 to the referenced global declaration (CHK-017).
            name: refAttr
                ? { namespaceURI: refAttr.namespaceURI, localName: refAttr.localName }
                : this.localElementName(el, ctx),
            typeRef,
            type: inlineType,
            nillable: el.getAttribute("nillable") === "true",
            ref: refAttr,
            identityConstraints: refAttr ? [] : this.buildIdentityConstraints(el, ctx),
            // A local declaration cannot head a substitution group (XSD 1.0
            // §3.3.6); it may still declare membership attributes (abstract,
            // default, fixed, block) when it is a real local declaration.
            substitutionGroup: null,
            abstract: el.getAttribute("abstract") === "true",
            default: el.getAttribute("default") ?? null,
            fixed: el.getAttribute("fixed") ?? null,
            block: this.normalizeTokens(el.getAttribute("block"), ctx.blockDefault, BLOCK_TOKENS),
        };
        this.checkValueConstraint(decl, el, ctx);
        ctx.locations.set(decl, locationOf(el));
        ctx.allElements.push(decl);
        return this.wrapParticle(ctx, el, decl);
    }

    private buildAttributeUse(el: Element, ctx: BuildContext): AttributeUse | null {
        const refAttr = this.readQName(el, "ref", ctx);
        const typeRef = refAttr ? null : this.readQName(el, "type", ctx);
        // A ref attribute use's identity is the referenced QName; its type is
        // resolved in pass 2 to the referenced global declaration (CHK-017).
        const name = refAttr
            ? { namespaceURI: refAttr.namespaceURI, localName: refAttr.localName }
            : this.localAttributeName(el, ctx);
        const decl: AttributeDeclaration = {
            kind: "attribute",
            name,
            typeRef,
            type: null,
            ref: refAttr,
        };
        ctx.allAttributes.push(decl);
        const use = el.getAttribute("use") ?? "optional";
        return {
            declaration: decl,
            required: use === "required",
            fixed: el.getAttribute("fixed") ?? null,
            defaultValue: el.getAttribute("default") ?? null,
            attributeGroupRef: null,
        };
    }

    private buildAnyParticle(el: Element, ctx: BuildContext): Particle {
        return this.wrapParticle(ctx, el, this.buildWildcard(el, ctx));
    }

    private buildWildcard(el: Element, ctx: BuildContext): Wildcard {
        const processContents = (el.getAttribute("processContents") ?? "strict") as "strict" | "lax" | "skip";
        const namespaceAttr = el.getAttribute("namespace");
        const violation = namespaceConstraintTokenViolation(namespaceAttr);
        if (violation) {
            ctx.report({
                severity: "error",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: violation,
                location: locationOf(el),
                phase: "schema-compilation",
            });
        }
        const namespaceConstraint = parseNamespaceConstraint(namespaceAttr, ctx.targetNamespace);
        return { kind: "wildcard", processContents, namespaceConstraint };
    }

    /**
     * Parse the identity-constraint children (xs:key, xs:unique, xs:keyref)
     * of an element declaration (XSD 1.0 §3.11.2, CHK-022).
     *
     * Selector/field XPath expressions are parsed and their namespace prefixes
     * resolved at compile time; a syntax error is a compile-time error. The
     * resolved definitions are registered on the grammar (for keyref @refer
     * resolution in pass 2) and returned in document order.
     */
    private buildIdentityConstraints(el: Element, ctx: BuildContext): IdentityConstraintDefinition[] {
        const out: IdentityConstraintDefinition[] = [];
        for (const child of childElements(el)) {
            if (child.namespaceURI !== NAMESPACE_XSD) continue;
            const category = child.localName;
            if (category !== "key" && category !== "unique" && category !== "keyref") continue;

            const loc = locationOf(child);
            const nameAttr = child.getAttribute("name");
            if (!nameAttr) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `An xs:${category} identity constraint must carry a name attribute.`,
                    location: loc,
                    phase: "schema-compilation",
                });
                continue;
            }

            // Read the selector and fields (in document order).
            let selector: string | null = null;
            const fields: string[] = [];
            for (const c of childElements(child)) {
                if (c.namespaceURI !== NAMESPACE_XSD) continue;
                if (c.localName === "selector") {
                    const xpath = c.getAttribute("xpath");
                    if (xpath !== null && xpath !== undefined) selector = xpath;
                } else if (c.localName === "field") {
                    const xpath = c.getAttribute("xpath");
                    if (xpath !== null && xpath !== undefined) fields.push(xpath);
                }
            }
            if (selector === null) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `Identity constraint ${nameAttr} must contain exactly one xs:selector element.`,
                    location: loc,
                    phase: "schema-compilation",
                });
                continue;
            }
            if (fields.length === 0) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `Identity constraint ${nameAttr} must contain at least one xs:field element.`,
                    location: loc,
                    phase: "schema-compilation",
                });
                continue;
            }

            const resolvePrefix = (prefix: string) => child.lookupNamespaceURI(prefix);
            let compiledSelector: ReturnType<typeof compileSelector> | null = null;
            try {
                compiledSelector = compileSelector(selector, resolvePrefix);
            } catch (e) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_IDENTITY_PATH",
                    message: `Invalid selector XPath '${selector}' in identity constraint ${nameAttr}: ${e instanceof IdentityPathError ? e.message : String(e)}`,
                    location: loc,
                    phase: "schema-compilation",
                });
            }
            let compiledFields: ReturnType<typeof compileField>[] = [];
            try {
                compiledFields = fields.map((f) => compileField(f, resolvePrefix));
            } catch (e) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_IDENTITY_PATH",
                    message: `Invalid field XPath in identity constraint ${nameAttr}: ${e instanceof IdentityPathError ? e.message : String(e)}`,
                    location: loc,
                    phase: "schema-compilation",
                });
            }
            if (compiledSelector === null || compiledFields.length !== fields.length) continue;

            const name: QName = { namespaceURI: ctx.targetNamespace, localName: nameAttr };
            const ic: IdentityConstraintDefinition = {
                kind: "identity-constraint",
                name,
                category: category as IdentityConstraintCategory,
                selector,
                fields,
                refer: null,
                referencedConstraint: null,
                compiledSelector,
                compiledFields,
            };

            if (category === "keyref") {
                const refer = this.readQName(child, "refer", ctx);
                if (!refer) {
                    ctx.report({
                        severity: "error",
                        code: "INVALID_SCHEMA_DOCUMENT",
                        message: `A keyref identity constraint must carry a refer attribute.`,
                        location: loc,
                        phase: "schema-compilation",
                    });
                    continue;
                }
                (ic as { refer: QName | null }).refer = refer;
                ctx.identityConstraintRefs.push({ ic, node: child });
            }

            ctx.allIdentityConstraints.push(ic);
            // Register by local name for keyref @refer resolution (identity
            // constraint names live in a single symbol space per target
            // namespace, XSD 1.0 §3.11.1).
            if (!ctx.grammar.identityConstraints.has(nameAttr)) {
                ctx.grammar.identityConstraints.set(nameAttr, ic);
            } else {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `Identity constraint name ${nameAttr} is already declared in this schema.`,
                    location: loc,
                    phase: "schema-compilation",
                });
            }
            out.push(ic);
        }
        return out;
    }

    private wrapParticle(ctx: BuildContext, el: Element, term: ParticleTerm): Particle {
        const minOccurs = this.readOccurs(el, "minOccurs", 1);
        const maxRaw = el.getAttribute("maxOccurs");
        const maxOccurs = maxRaw === UNBOUNDED ? UNBOUNDED : this.readOccurs(el, "maxOccurs", 1);
        const particle: Particle = { minOccurs, maxOccurs, term };
        ctx.particleNodes.set(particle, el);
        return particle;
    }

    private localElementName(el: Element, ctx: BuildContext): QName {
        const localName = el.getAttribute("name") ?? "";
        const form = el.getAttribute("form") ?? (ctx.elementFormDefault ? "qualified" : "unqualified");
        return form === "qualified"
            ? { namespaceURI: ctx.targetNamespace, localName }
            : { namespaceURI: null, localName };
    }

    private localAttributeName(el: Element, ctx: BuildContext): QName {
        const localName = el.getAttribute("name") ?? "";
        const form = el.getAttribute("form") ?? (ctx.attributeFormDefault ? "qualified" : "unqualified");
        return form === "qualified"
            ? { namespaceURI: ctx.targetNamespace, localName }
            : { namespaceURI: null, localName };
    }

    // -----------------------------------------------------------------------
    // Pass 2 — reference resolution
    // -----------------------------------------------------------------------

    private resolveReferencePass(ctx: BuildContext, grammars: Map<string, CompiledGrammar>): void {
        for (const decl of ctx.allElements) {
            if (!decl.typeRef) continue;
            const resolved = this.lookupType(grammars, decl.typeRef);
            if (resolved) {
                (decl as { type: TypeDefinition | null }).type = resolved;
            } else {
                ctx.report({
                    severity: "error",
                    code: "UNRESOLVED_TYPE",
                    message: `Type reference ${displayQName(decl.typeRef)} does not resolve to a declared type.`,
                    location: ctx.locations.get(decl) ?? { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            }
        }

        // XSD 1.0 §3.3.2: an element declaration with a default/fixed value
        // constraint must have a simple type or a complex type with simple
        // content (the fixed/default value is a value of that type).
        for (const decl of ctx.allElements) {
            if (decl.default === null && decl.fixed === null) continue;
            const t = decl.type;
            if (t?.kind === "complex-type" && t.contentType !== "simple") {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `Element ${displayQName(decl.name)} declares a ${decl.default !== null ? "default" : "fixed"} value constraint but its type does not have simple content.`,
                    location: ctx.locations.get(decl) ?? { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            }
        }
        for (const attr of ctx.allAttributes) {
            if (!attr.typeRef) continue;
            const resolved = this.lookupType(grammars, attr.typeRef);
            if (!resolved) {
                ctx.report({
                    severity: "error",
                    code: "UNRESOLVED_TYPE",
                    message: `Type reference ${displayQName(attr.typeRef)} on attribute ${displayQName(attr.name)} does not resolve to a declared type.`,
                    location: { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            } else if (resolved.kind === "simple-type") {
                (attr as { type: SimpleTypeDefinition | null }).type = resolved;
            } else {
                ctx.report({
                    severity: "error",
                    code: "UNRESOLVED_TYPE",
                    message: `Type reference ${displayQName(attr.typeRef)} on attribute ${displayQName(attr.name)} must resolve to a simple type.`,
                    location: { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            }
        }
        for (const { ref, node } of ctx.refs) {
            if (!this.lookupType(grammars, ref) && !this.lookupElement(grammars, ref)) {
                ctx.report({
                    severity: "error",
                    code: "UNRESOLVED_TYPE",
                    message: `Reference ${displayQName(ref)} does not resolve to a declared component.`,
                    location: locationOf(node),
                    phase: "schema-compilation",
                });
            }
        }

        // Pass 2b — resolve element references (ref=) to their global
        // declarations, carrying the referenced declaration's type onto the
        // particle (CHK-017). Unresolved references are compile errors.
        for (const decl of ctx.allElements) {
            if (!decl.ref) continue;
            const resolved = this.lookupElement(grammars, decl.ref);
            if (resolved) {
                (decl as { type: TypeDefinition | null }).type = resolved.type;
                (decl as { nillable: boolean }).nillable = resolved.nillable;
            } else {
                ctx.report({
                    severity: "error",
                    code: "UNRESOLVED_REFERENCE",
                    message: `Element reference ${displayQName(decl.ref)} does not resolve to a global element declaration.`,
                    location: ctx.locations.get(decl) ?? { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            }
        }

        // Pass 2c — resolve attribute references (ref=) to their global
        // declarations (CHK-017).
        for (const attr of ctx.allAttributes) {
            if (!attr.ref) continue;
            const resolved = this.lookupAttribute(grammars, attr.ref);
            if (resolved) {
                (attr as { type: SimpleTypeDefinition | null }).type = resolved.type;
            } else {
                ctx.report({
                    severity: "error",
                    code: "UNRESOLVED_REFERENCE",
                    message: `Attribute reference ${displayQName(attr.ref)} does not resolve to a global attribute declaration.`,
                    location: { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            }
        }

        // Pass 2d — resolve keyref @refer references to their key/unique
        // identity-constraint definitions (CHK-022). A keyref must have the
        // same number of fields as the referenced key (XSD 1.0 §3.11.6).
        for (const { ic, node } of ctx.identityConstraintRefs) {
            const refer = ic.refer!;
            const referenced = this.lookupIdentityConstraint(grammars, refer);
            if (!referenced) {
                ctx.report({
                    severity: "error",
                    code: "UNRESOLVED_REFERENCE",
                    message: `Keyref ${displayQName(ic.name)} refers to identity constraint ${displayQName(refer)} which is not declared.`,
                    location: locationOf(node),
                    phase: "schema-compilation",
                });
                continue;
            }
            if (referenced.category === "keyref") {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `Keyref ${displayQName(ic.name)} refers to ${displayQName(refer)}, which is itself a keyref; a keyref must refer to a key or unique.`,
                    location: locationOf(node),
                    phase: "schema-compilation",
                });
                continue;
            }
            if (referenced.fields.length !== ic.fields.length) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `Keyref ${displayQName(ic.name)} has ${ic.fields.length} field(s) but the referenced ${referenced.category} ${displayQName(refer)} has ${referenced.fields.length}; they must be equal.`,
                    location: locationOf(node),
                    phase: "schema-compilation",
                });
                continue;
            }
            (ic as { referencedConstraint: IdentityConstraintDefinition | null }).referencedConstraint = referenced;
        }
    }

    // -----------------------------------------------------------------------
    // Pass 2a.5 — substitution groups (CHK-023)
    // -----------------------------------------------------------------------

    /**
     * Resolve every global element's substitutionGroup affiliation and build
     * the transitive member set per head (XSD 1.0 §3.3.6).
     *
     * The substitution group of a head H is the set containing H itself, every
     * global element declaring H as its substitutionGroup, and — transitively —
     * every member of any member's own group. Validation uses these sets to
     * accept a member element anywhere the head is expected.
     *
     * Affiliation rules enforced here (cos-element-decl-props-correct):
     * - the affiliation must resolve to a declared global element;
     * - the head must live in the same target namespace as the member;
     * - an element must not be a member of its own group (no cycles).
     */
    private buildSubstitutionGroups(ctx: BuildContext, grammars: Map<string, CompiledGrammar>): void {
        // member -> resolved head (only successful affiliations).
        const memberOf: Array<{ member: ElementDeclaration; head: ElementDeclaration }> = [];

        for (const decl of ctx.allElements) {
            if (decl.scope !== "global") continue;
            const affiliation = decl.substitutionGroup;
            if (!affiliation) continue;
            const loc = ctx.locations.get(decl) ?? { line: 0, column: 0 };
            const head = this.lookupElement(grammars, affiliation);
            if (!head) {
                ctx.report({
                    severity: "error",
                    code: "UNRESOLVED_REFERENCE",
                    message: `Substitution group head ${displayQName(affiliation)} of element ${displayQName(decl.name)} does not resolve to a global element declaration.`,
                    location: loc,
                    phase: "schema-compilation",
                });
                continue;
            }
            if (head.name.namespaceURI !== decl.name.namespaceURI) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `Substitution group head ${displayQName(head.name)} of element ${displayQName(decl.name)} must be in the same target namespace as the member.`,
                    location: loc,
                    phase: "schema-compilation",
                });
                continue;
            }
            if (qnameEqual(head.name, decl.name)) {
                ctx.report({
                    severity: "error",
                    code: "CIRCULAR_REFERENCE",
                    message: `Element ${displayQName(decl.name)} cannot be a member of its own substitution group.`,
                    location: loc,
                    phase: "schema-compilation",
                });
                continue;
            }
            memberOf.push({ member: decl, head });
        }

        // Cycle detection on the affiliation graph: following substitutionGroup
        // refs must never return to a declaration already on the path.
        for (const { member } of memberOf) {
            const seen = new Set<ElementDeclaration>();
            let cur: ElementDeclaration | null = member;
            while (cur) {
                if (seen.has(cur)) {
                    ctx.report({
                        severity: "error",
                        code: "CIRCULAR_REFERENCE",
                        message: `Circular substitution group: element ${displayQName(member.name)} is transitively a member of its own substitution group.`,
                        location: ctx.locations.get(member) ?? { line: 0, column: 0 },
                        phase: "schema-compilation",
                    });
                    break;
                }
                seen.add(cur);
                cur = memberOf.find((m) => m.member === cur)?.head ?? null;
            }
        }

        // Transitive closure per head: {head} ∪ members ∪ members-of-member-heads.
        // Members share the head's namespace (checked above), so every head
        // lives in exactly one grammar; groups are keyed by head local name on
        // that grammar (CompiledGrammar.substitutionGroups, CHK-023). Keying
        // direct members by full QName avoids cross-namespace collisions in a
        // multi-document schema set (CHK-024).
        const directByQName = new Map<string, ElementDeclaration[]>();
        for (const m of memberOf) {
            const key = qnameKey(m.head.name);
            const list = directByQName.get(key);
            if (list) list.push(m.member);
            else directByQName.set(key, [m.member]);
        }

        for (const [, grammar] of ctx.grammarsByNamespace) {
            const headNames = new Set<string>();
            for (const m of memberOf) {
                if (m.head.name.namespaceURI === grammar.namespaceURI) headNames.add(m.head.name.localName);
            }
            const groups = new Map<string, ElementDeclaration[]>();
            for (const headName of headNames) {
                const out: ElementDeclaration[] = [];
                const queue: ElementDeclaration[] = [];
                const head = grammar.elements.get(headName);
                if (!head) continue;
                out.push(head);
                queue.push(head);
                const seen = new Set<ElementDeclaration>([head]);
                while (queue.length > 0) {
                    const cur = queue.pop()!;
                    for (const member of directByQName.get(qnameKey(cur.name)) ?? []) {
                        if (seen.has(member)) continue;
                        seen.add(member);
                        // XSD 1.0 §3.3.6 (cos-element-decl-consistent): if the
                        // head has a type, the member's type must be validly
                        // derived from the head's type (any derivation method
                        // is accepted, including extension).
                        if (head.type && member.type && !this.isValidlyDerived(member.type, head.type)) {
                            ctx.report({
                                severity: "error",
                                code: "INVALID_SCHEMA_DOCUMENT",
                                message: `Element ${displayQName(member.name)} is a member of the substitution group of ${displayQName(head.name)} but its type is not validly derived from the head's type.`,
                                location: ctx.locations.get(member) ?? { line: 0, column: 0 },
                                phase: "schema-compilation",
                            });
                            continue;
                        }
                        out.push(member);
                        // A member that is itself a head brings its own members.
                        queue.push(member);
                    }
                }
                groups.set(headName, out);
            }
            grammar.substitutionGroups = groups;
        }
    }

    private lookupType(grammars: Map<string, CompiledGrammar>, q: QName): TypeDefinition | null {
        return grammars.get(namespaceKey(q.namespaceURI))?.types.get(q.localName) ?? null;
    }

    private lookupElement(grammars: Map<string, CompiledGrammar>, q: QName): ElementDeclaration | null {
        return grammars.get(namespaceKey(q.namespaceURI))?.elements.get(q.localName) ?? null;
    }

    private lookupAttribute(grammars: Map<string, CompiledGrammar>, q: QName): AttributeDeclaration | null {
        return grammars.get(namespaceKey(q.namespaceURI))?.attributes.get(q.localName) ?? null;
    }

    private lookupModelGroup(grammars: Map<string, CompiledGrammar>, q: QName): ModelGroupDefinition | null {
        return grammars.get(namespaceKey(q.namespaceURI))?.modelGroups.get(q.localName) ?? null;
    }

    private lookupAttributeGroup(grammars: Map<string, CompiledGrammar>, q: QName): AttributeGroupDefinition | null {
        return grammars.get(namespaceKey(q.namespaceURI))?.attributeGroups.get(q.localName) ?? null;
    }

    private lookupIdentityConstraint(grammars: Map<string, CompiledGrammar>, q: QName): IdentityConstraintDefinition | null {
        return grammars.get(namespaceKey(q.namespaceURI))?.identityConstraints.get(q.localName) ?? null;
    }

    // -----------------------------------------------------------------------
    // Pass 2c/2d — named model group and attribute group expansion (CHK-019)
    // -----------------------------------------------------------------------

    /**
     * Expand `<xs:group ref="…">` placeholders into the referenced definition's
     * particle tree (AD §5 pass 3: structural references). Runs depth-first with
     * an expansion stack so circular references are compile-time errors.
     *
     * The ref particle keeps its own minOccurs/maxOccurs; the definition's top
     * compositor particle is spliced as the term. When the definition's top
     * compositor carries a non-default occurrence, the placeholder becomes a
     * sequence wrapper holding that particle, so the two occurrence ranges
     * compose exactly as in the inlined schema.
     */
    private expandModelGroups(ctx: BuildContext, grammars: Map<string, CompiledGrammar>): void {
        const report = ctx.report;
        const expanding = new Set<string>();

        const locationOfParticle = (p: Particle): SchemaLocation => {
            const node = ctx.particleNodes.get(p);
            return node ? locationOf(node) : { line: 0, column: 0 };
        };

        const expandTree = (particle: Particle): void => {
            const walk = (p: Particle): void => {
                const term = p.term;
                if (term.kind !== "sequence" && term.kind !== "choice" && term.kind !== "all") return;
                if (!term.ref) {
                    for (const child of term.particles) walk(child);
                    return;
                }

                const def = this.lookupModelGroup(grammars, term.ref);
                if (!def) {
                    report({
                        severity: "error",
                        code: "UNRESOLVED_REFERENCE",
                        message: `Model group reference ${displayQName(term.ref)} does not resolve to a global xs:group definition.`,
                        location: locationOfParticle(p),
                        phase: "schema-compilation",
                    });
                    (term as { ref: QName | null }).ref = null;
                    return;
                }

                const key = qnameKey(def.name);
                if (expanding.has(key)) {
                    report({
                        severity: "error",
                        code: "CIRCULAR_REFERENCE",
                        message: `Circular model group reference: ${displayQName(term.ref)} references itself (directly or transitively).`,
                        location: locationOfParticle(p),
                        phase: "schema-compilation",
                    });
                    (term as { ref: QName | null }).ref = null;
                    return;
                }

                expanding.add(key);
                expandTree(def.particle);
                expanding.delete(key);

                // Check if the inner expansion already cleared this ref
                // (circular or unresolvable — just leave empty).
                if (term.ref === null) return;

                const defParticle = def.particle;
                const defGroup = defParticle.term as ModelGroup;
                if (defParticle.minOccurs === 1 && defParticle.maxOccurs === 1) {
                    // Default definition occurrence: splice the group directly.
                    (term as { kind: "sequence" | "choice" | "all"; particles: ReadonlyArray<Particle>; ref: QName | null }).kind = defGroup.kind;
                    (term as { particles: ReadonlyArray<Particle> }).particles = defGroup.particles;
                    (term as { ref: QName | null }).ref = null;
                } else {
                    // Non-default definition occurrence: wrap in a one-child
                    // sequence so the ref particle's occurrence composes with it.
                    (term as { kind: "sequence" | "choice" | "all" }).kind = "sequence";
                    (term as { particles: ReadonlyArray<Particle> }).particles = [
                        { minOccurs: defParticle.minOccurs, maxOccurs: defParticle.maxOccurs, term: defGroup },
                    ];
                    (term as { ref: QName | null }).ref = null;
                }
            };
            walk(particle);
        };

        // Expand every definition's own tree, then every complex type's tree.
        for (const { def } of ctx.allModelGroupDefs) {
            expandTree(def.particle);
        }
        for (const { type } of ctx.allComplexTypes) {
            if (type.particle) expandTree(type.particle);
        }
    }

    /**
     * Expand `<xs:attributeGroup ref="…">` placeholder uses into the referenced
     * definition's uses (recursively, with cycle detection). After expansion,
     * duplicate attribute uses within one complex type are compile errors
     * (XSD 1.0 §3.4.3 ct-props-correct).
     */
    private expandAttributeGroups(ctx: BuildContext, grammars: Map<string, CompiledGrammar>): void {
        const report = ctx.report;
        const expanding = new Set<string>();

        const expandUses = (uses: ReadonlyArray<AttributeUse>): AttributeUse[] => {
            const out: AttributeUse[] = [];
            for (const use of uses) {
                const ref = use.attributeGroupRef;
                if (!ref) {
                    out.push(use);
                    continue;
                }
                const node = ctx.attributeGroupRefNodes.get(use);
                const def = this.lookupAttributeGroup(grammars, ref);
                if (!def) {
                    report({
                        severity: "error",
                        code: "UNRESOLVED_REFERENCE",
                        message: `Attribute group reference ${displayQName(ref)} does not resolve to a global xs:attributeGroup definition.`,
                        location: node ? locationOf(node) : { line: 0, column: 0 },
                        phase: "schema-compilation",
                    });
                    continue;
                }
                const key = qnameKey(def.name);
                if (expanding.has(key)) {
                    report({
                        severity: "error",
                        code: "CIRCULAR_REFERENCE",
                        message: `Circular attribute group reference: ${displayQName(ref)} references itself (directly or transitively).`,
                        location: node ? locationOf(node) : { line: 0, column: 0 },
                        phase: "schema-compilation",
                    });
                    continue;
                }
                expanding.add(key);
                const expanded = expandUses(def.attributeUses);
                expanding.delete(key);
                out.push(...expanded);
            }
            return out;
        };

        const checkDuplicateUses = (owner: string, uses: ReadonlyArray<AttributeUse>): void => {
            const seen = new Set<string>();
            for (const use of uses) {
                const key = qnameKey(use.declaration.name);
                if (seen.has(key)) {
                    report({
                        severity: "error",
                        code: "INVALID_SCHEMA_DOCUMENT",
                        message: `Attribute ${displayQName(use.declaration.name)} is declared more than once in ${owner}.`,
                        location: { line: 0, column: 0 },
                        phase: "schema-compilation",
                    });
                }
                seen.add(key);
            }
        };

        // Expand each attribute group definition first (their uses may reference
        // other attribute groups), then every complex type's uses.
        for (const { def } of ctx.allAttributeGroupDefs) {
            const expanded = expandUses(def.attributeUses);
            (def as { attributeUses: ReadonlyArray<AttributeUse> }).attributeUses = expanded;
            checkDuplicateUses(`xs:attributeGroup ${displayQName(def.name)}`, expanded);
        }
        for (const { type } of ctx.allComplexTypes) {
            const expanded = expandUses(type.attributeUses);
            (type as { attributeUses: ReadonlyArray<AttributeUse> }).attributeUses = expanded;
            checkDuplicateUses(
                type.name ? `complex type ${displayQName(type.name)}` : "an anonymous complex type",
                expanded
            );
        }
    }

    // -----------------------------------------------------------------------
    // Pass 2d.5 — compute attribute wildcards (CHK-021)
    // -----------------------------------------------------------------------

    /**
     * Compute every attribute group's and complex type's "complete wildcard"
     * (XSD 1.0 §3.4.3): the local `<xs:anyAttribute>` wildcard intersected
     * with the {attribute wildcard}s of directly referenced attribute groups.
     * When there is no local wildcard, the process contents comes from the
     * first non-absent group wildcard (§3.4.3 rule 2.2.2).
     *
     * Runs after attribute-group expansion so all references are spliced.
     * Complex-type wildcards are the input to pass 2f, which unions the base
     * type's wildcard in for extension derivations.
     */
    private resolveAttributeWildcards(ctx: BuildContext, grammars: Map<string, CompiledGrammar>): void {
        const computed = new Map<object, Wildcard | null>();
        const inProgress = new Set<object>();

        const compute = (owner: AttributeGroupDefinition | ComplexTypeDefinition): Wildcard | null => {
            if (computed.has(owner)) return computed.get(owner) ?? null;
            if (inProgress.has(owner)) return null; // circular → error already reported
            inProgress.add(owner);
            const local = owner.attributeWildcard;
            const refs = ctx.attributeGroupWildcardRefs.get(owner) ?? [];
            const groupWildcards: Wildcard[] = [];
            for (const ref of refs) {
                const def = this.lookupAttributeGroup(grammars, ref);
                if (!def) continue; // UNRESOLVED_REFERENCE already reported in pass 2d
                const gw = compute(def);
                if (gw) groupWildcards.push(gw);
            }
            let complete: Wildcard | null;
            if (groupWildcards.length === 0) {
                complete = local;
            } else if (local) {
                // 2.2.1: intersection of local + group wildcards; processContents
                // is the local wildcard's.
                const constraint = this.intersectConstraints([local.namespaceConstraint, ...groupWildcards.map((g) => g.namespaceConstraint)]);
                complete = { kind: "wildcard", processContents: local.processContents, namespaceConstraint: constraint };
            } else {
                // 2.2.2: intersection of the group wildcards; processContents
                // is the first non-absent group wildcard's.
                const constraint = this.intersectConstraints(groupWildcards.map((g) => g.namespaceConstraint));
                complete = { kind: "wildcard", processContents: groupWildcards[0]!.processContents, namespaceConstraint: constraint };
            }
            inProgress.delete(owner);
            computed.set(owner, complete);
            (owner as { attributeWildcard: Wildcard | null }).attributeWildcard = complete;
            return complete;
        };

        for (const { def } of ctx.allAttributeGroupDefs) compute(def);
        for (const { type } of ctx.allComplexTypes) compute(type);
    }

    /** Fold wildcard constraints with the intensional intersection (§3.10.6). */
    private intersectConstraints(constraints: ReadonlyArray<NamespaceConstraint>): NamespaceConstraint {
        let acc = constraints[0]!;
        for (let i = 1; i < constraints.length; i++) {
            const next = wildcardIntersection(acc, constraints[i]!);
            // An inexpressible intersection (e.g. two ##other of different
            // targets) cannot occur within one schema; fall back to matching
            // nothing rather than guessing.
            acc = next ?? { kind: "uris", uris: new Set() };
        }
        return acc;
    }

    // -----------------------------------------------------------------------
    // Pass 2e — resolve derivation bases (CHK-020)
    // -----------------------------------------------------------------------

    /**
     * Resolve the `base` QName reference of every complex/simple content
     * derivation to its complex type definition (or record the base as a
     * pure simple type for simpleContent restriction).
     */
    private resolveDerivationBases(
        ctx: BuildContext,
        grammars: Map<string, CompiledGrammar>,
    ): void {
        for (const d of ctx.derivations) {
            const resolved = this.lookupType(grammars, d.ref);
            if (!resolved) continue; // UNRESOLVED_TYPE already reported in pass 2
            if (resolved.kind !== "complex-type") {
                if (d.form === "simple" && d.method === "restriction") {
                    // Pure simple-type base is legal for simpleContent restriction.
                    d.baseResolved = true;
                    d.baseKind = "simple";
                    continue;
                }
                if (d.form === "simple" && d.method === "extension") {
                    // Simple-content extension with a simple-type base is
                    // accepted in XSD 1.0 (the processor creates a complex type
                    // with simple content from the simple type).
                    d.baseResolved = true;
                    d.baseKind = "simple";
                    d.resolvedSimpleType = resolved;
                    continue;
                }
                ctx.report({
                    severity: "error",
                    code: d.method === "extension" ? "INVALID_EXTENSION" : "INVALID_RESTRICTION",
                    message: `The base type ${displayQName(d.ref)} of a ${d.form === "simple" ? "simpleContent" : "complexContent"} ${d.method} must be a complex type, but it is a simple type.`,
                    location: locationOf(d.node),
                    phase: "schema-compilation",
                });
                continue;
            }
            d.baseResolved = true;
            d.baseKind = "complex";
            (d.type as { baseType: ComplexTypeDefinition | null }).baseType = resolved;
        }
    }

    // -----------------------------------------------------------------------
    // Pass 2f — compute effective derived content (CHK-020)
    // -----------------------------------------------------------------------

    /**
     * Compute the effective content of every derived complex type.
     * For extension: splice the base particle and new particle into a sequence.
     * For simpleContent extension: inherit the base's simple type.
     * For restriction: the declared particle is the effective particle.
     *
     * Processes derivations base-first so that spliced base content is already
     * final when a derived type needs it.
     */
    private computeDerivedContent(ctx: BuildContext): void {
        const processed = new Set<ComplexTypeDefinition>();
        const processing = new Set<ComplexTypeDefinition>();

        const process = (type: ComplexTypeDefinition): void => {
            if (processed.has(type)) return;
            if (processing.has(type)) return; // cycle → reported in validateDerivations
            processing.add(type);
            const base = type.baseType;
            // Ensure the base's own content is computed first.
            if (base && base.baseType) process(base);
            const d = ctx.derivations.find((r) => r.type === type);
            if (d && d.baseResolved) {
                if (d.baseKind === "complex" && base) {
                    this.spliceDerivation(ctx, d, base);
                } else if (d.baseKind === "simple") {
                    this.spliceSimpleBaseDerivation(d);
                }
            }
            processing.delete(type);
            processed.add(type);
        };

        for (const d of ctx.derivations) process(d.type);
    }

    /**
     * Splice a derivation whose base is a pure simple type (simpleContent
     * extension: the derived complex type's simple content is the base simple
     * type; simpleContent restriction: handled by the facet framework).
     */
    private spliceSimpleBaseDerivation(
        d: BuildContext["derivations"][number],
    ): void {
        const type = d.type;
        if (d.method === "extension" && d.resolvedSimpleType?.kind === "simple-type") {
            (type as { simpleType: SimpleTypeDefinition | null }).simpleType = d.resolvedSimpleType;
        }
    }

    /**
     * Splice a single derivation's effective content onto its type.
     * `base` is the resolved base complex type (already fully processed).
     */
    private spliceDerivation(
        ctx: BuildContext,
        d: BuildContext["derivations"][number],
        base: ComplexTypeDefinition,
    ): void {
        const type = d.type;

        if (d.method === "extension") {
            if (d.form === "complex") {
                // Extension of complex content: splice base particle + new particle.
                if (base.contentType !== "simple") {
                    const baseParticle = base.particle;
                    const newParticle = type.particle;
                    let effective: Particle | null;
                    if (baseParticle && newParticle) {
                        effective = {
                            minOccurs: 1,
                            maxOccurs: 1,
                            term: {
                                kind: "sequence",
                                particles: [baseParticle, newParticle],
                                ref: null,
                            },
                        };
                    } else {
                        effective = baseParticle ?? newParticle;
                    }
                    (type as { particle: Particle | null }).particle = effective;

                    // Final content type per cos-ct-extends.
                    const derivedMixed = type.contentType === "mixed";
                    if (base.contentType === "empty") {
                        (type as { contentType: ContentType }).contentType =
                            effective ? (derivedMixed ? "mixed" : "element-only") : "empty";
                    } else {
                        (type as { contentType: ContentType }).contentType =
                            derivedMixed ? "mixed" : base.contentType;
                    }
                }
            } else {
                // simpleContent extension: inherit the base's simple type.
                if (base.contentType === "simple" && base.simpleType) {
                    (type as { simpleType: SimpleTypeDefinition | null }).simpleType = base.simpleType;
                }
            }

            // Attribute uses: base's followed by the extension's own (validated
            // for name clashes in pass 3b).
            (type as { attributeUses: ReadonlyArray<AttributeUse> }).attributeUses = [
                ...base.attributeUses,
                ...d.newAttributeUses,
            ];

            // Attribute wildcard: the extension's complete wildcard, unioned
            // with the base's (§3.4.2 rule 3.2.2, Attribute Wildcard Union).
            // When the union is not expressible, report and fall back to a
            // wildcard matching nothing.
            const complete = type.attributeWildcard;
            const baseWildcard = base.attributeWildcard;
            if (baseWildcard !== null) {
                if (complete === null) {
                    (type as { attributeWildcard: Wildcard | null }).attributeWildcard = baseWildcard;
                } else {
                    const union = wildcardUnion(baseWildcard.namespaceConstraint, complete.namespaceConstraint);
                    if (union === null) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_EXTENSION",
                            message: `The attribute wildcard union of the base (${describeConstraint(baseWildcard.namespaceConstraint)}) and the extension (${describeConstraint(complete.namespaceConstraint)}) is not expressible.`,
                            location: locationOf(d.node),
                            phase: "schema-compilation",
                        });
                    }
                    (type as { attributeWildcard: Wildcard | null }).attributeWildcard = {
                        kind: "wildcard",
                        processContents: complete.processContents,
                        namespaceConstraint: union ?? { kind: "uris", uris: new Set() },
                    };
                }
            }
            // baseWildcard === null: the type keeps its complete wildcard.
        } else {
            // Restriction
            if (d.form === "complex" && base.contentType === "simple") {
                // Complex-content restriction of a simple-content base: the
                // derived type inherits simple content from the base.
                (type as { contentType: ContentType }).contentType = "simple";
                (type as { simpleType: SimpleTypeDefinition | null }).simpleType = base.simpleType;
            } else if (d.form === "complex" && base.contentType === "empty") {
                // Empty restriction: derived content type must be empty.
                (type as { contentType: ContentType }).contentType = "empty";
            }
            // For complex restriction (element-only/mixed), the declared
            // particle is the effective particle (validated in pass 3b).
        }
    }

    // -----------------------------------------------------------------------
    // Pass 3b — validate derivations (CHK-020)
    // -----------------------------------------------------------------------

    /**
     * Validate every complex/simple content derivation against the spec's
     * extension and restriction rules. Runs after all type references and
     * simple-type chains are resolved (pass 3) so element/attribute type
     * restriction checks can walk base-type chains.
     */
    private validateDerivations(ctx: BuildContext): void {
        // 1. Circular derivation detection.
        this.checkDerivationCycles(ctx);

        // 2. Per-derivation rules.
        for (const d of ctx.derivations) {
            if (!d.baseResolved) continue;

            if (d.baseKind === "simple") {
                if (d.method === "restriction") {
                    // Pure simple-type base for a simpleContent restriction:
                    // a simple type has no attribute uses, so the derived type
                    // must not declare any attributes.
                    if (d.type.attributeUses.length > 0) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_RESTRICTION",
                            message: "A simpleContent restriction against a simple type cannot declare attributes; use a simpleContent extension to add attributes.",
                            location: locationOf(d.node),
                            phase: "schema-compilation",
                        });
                    }
                    if (d.type.attributeWildcard !== null) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_RESTRICTION",
                            message: "A simpleContent restriction against a simple type cannot declare an attribute wildcard (xs:anyAttribute); use a simpleContent extension to add one.",
                            location: locationOf(d.node),
                            phase: "schema-compilation",
                        });
                    }
                }
                continue;
            }

            const base = d.type.baseType!;
            // XSD 1.0 §3.4.2: the base type's final (or the schema's
            // finalDefault) forbids the derivation method used against it.
            if (base.final.split(/\s+/).includes(d.method)) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_FINAL",
                    message: `Base type ${displayQName(base.name ?? { namespaceURI: null, localName: "(anonymous)" })} is final with respect to ${d.method} and cannot be used as the base of a ${d.form === "simple" ? "simpleContent" : "complexContent"} ${d.method}.`,
                    location: locationOf(d.node),
                    phase: "schema-compilation",
                });
            }
            if (d.method === "extension") {
                this.validateExtension(ctx, d, base);
            } else {
                this.validateRestriction(ctx, d, base);
            }
        }
    }

    /**
     * Detect circular derivation chains and report CIRCULAR_DERIVATION.
     */
    private checkDerivationCycles(ctx: BuildContext): void {
        const fullyChecked = new Set<ComplexTypeDefinition>();
        for (const d of ctx.derivations) {
            if (fullyChecked.has(d.type)) continue;
            const onStack = new Set<ComplexTypeDefinition>();
            const stack: ComplexTypeDefinition[] = [];
            let cur: ComplexTypeDefinition | null = d.type;
            let cycle = false;
            while (cur) {
                if (onStack.has(cur)) {
                    cycle = true;
                    break;
                }
                if (fullyChecked.has(cur)) break;
                onStack.add(cur);
                stack.push(cur);
                cur = cur.baseType;
            }
            if (cycle) {
                ctx.report({
                    severity: "error",
                    code: "CIRCULAR_DERIVATION",
                    message: `Circular derivation: type ${displayQName(d.type.name ?? { namespaceURI: null, localName: "(anonymous)" })} derives from itself (directly or transitively).`,
                    location: locationOf(d.node),
                    phase: "schema-compilation",
                });
            }
            for (const t of stack) fullyChecked.add(t);
        }
    }

    /**
     * Validate a single extension derivation (complexContent or simpleContent).
     */
    private validateExtension(
        ctx: BuildContext,
        d: BuildContext["derivations"][number],
        base: ComplexTypeDefinition,
    ): void {
        const loc = locationOf(d.node);

        if (d.form === "complex") {
            // Complex-content extension cannot extend a simple-content type.
            if (base.contentType === "simple") {
                ctx.report({
                    severity: "error",
                    code: "INVALID_EXTENSION",
                    message: `Complex content cannot extend type ${displayQName(base.name ?? { namespaceURI: null, localName: "(anonymous)" })} which has simple content; use a simpleContent extension.`,
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        } else {
            // SimpleContent extension requires the base to be a complex type
            // with simple content.
            if (base.contentType !== "simple" || !base.simpleType) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_EXTENSION",
                    message: `The base of a simpleContent extension must be a complex type with simple content, but ${displayQName(d.ref)} has ${base.contentType} content.`,
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        }

        // Attribute name clash: extension attribute uses must not duplicate
        // any attribute name already present on the base type.
        const baseNames = new Set(base.attributeUses.map((u) => qnameKey(u.declaration.name)));
        for (const u of d.newAttributeUses) {
            if (baseNames.has(qnameKey(u.declaration.name))) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_EXTENSION",
                    message: `Attribute ${displayQName(u.declaration.name)} is already declared on the base type and cannot be redeclared by an extension.`,
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        }
    }

    /**
     * Validate a single restriction derivation (complexContent or simpleContent).
     */
    private validateRestriction(
        ctx: BuildContext,
        d: BuildContext["derivations"][number],
        base: ComplexTypeDefinition,
    ): void {
        const type = d.type;
        const loc = locationOf(d.node);

        // 0. simpleContent restriction against a complex base: the base must
        // have simple content (a pure simple-type base is handled separately
        // in validateDerivations).
        if (d.form === "simple" && base.contentType !== "simple") {
            ctx.report({
                severity: "error",
                code: "INVALID_RESTRICTION",
                message: `The base of a simpleContent restriction must be a complex type with simple content, but ${displayQName(base.name ?? { namespaceURI: null, localName: "(anonymous)" })} has ${base.contentType} content.`,
                location: loc,
                phase: "schema-compilation",
            });
        }

        // 1. Content-type consistency (derivation-ok-restriction).
        if (base.contentType === "simple") {
            if (type.contentType !== "simple") {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: "The restriction must have simple content when the base type has simple content.",
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        } else if (base.contentType === "empty") {
            if (type.contentType !== "empty") {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: "The restriction must have empty content when the base type has empty content.",
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        } else {
            // base: element-only or mixed
            if (type.contentType === "empty") {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: "The restriction must have element-only or mixed content when the base type has element-only or mixed content.",
                    location: loc,
                    phase: "schema-compilation",
                });
            } else if (type.contentType === "mixed" && base.contentType === "element-only") {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: "Element-only content cannot be restricted to mixed content.",
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        }

        // 2. CTR-all-compile: reject any complex restriction involving an
        // all-group in either the base or the derived content model.
        if (this.containsAllGroup(type.particle) || this.containsAllGroup(base.particle)) {
            ctx.report({
                severity: "error",
                code: "ALL_GROUP_RESTRICTION",
                message: "Complex type restriction with an xs:all group is rejected at compile time (CTR-all-compile policy, CHK-020).",
                location: loc,
                phase: "schema-compilation",
            });
        }

        // 3. Particle restriction (XSD 1.0 §3.9.6).
        if (base.particle === null) {
            if (type.particle !== null) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: "A restriction cannot introduce a content model when the base type has no content model (empty content).",
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        } else if (type.particle === null) {
            // Restricting to no particle: valid only if the base particle is
            // nullable (minOccurs = 0).
            if (base.particle.minOccurs !== 0) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: "Restricting to empty content requires the base content model to be nullable (minOccurs=0).",
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        } else {
            const msg = this.particleRestrictionMessage(type.particle, base.particle);
            if (msg) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: `Invalid particle restriction: ${msg}`,
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        }

        // 4. Attribute use restriction (subset by name, type restriction,
        // requiredness compatibility).
        this.validateAttributeRestriction(ctx, d, base);

        // 5. Attribute wildcard restriction (derivation-ok-restriction.4, CHK-021):
        // if the derived type has an attribute wildcard, the base must have one
        // too, the derived constraint must be a subset of the base's, and the
        // derived processContents must be at least as strict.
        const derivedWildcard = type.attributeWildcard;
        if (derivedWildcard !== null) {
            const baseWildcard = base.attributeWildcard;
            if (baseWildcard === null) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: "The restricted type declares an attribute wildcard but the base type has none.",
                    location: loc,
                    phase: "schema-compilation",
                });
            } else if (!wildcardSubset(derivedWildcard.namespaceConstraint, baseWildcard.namespaceConstraint)) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: `The restricted type's attribute wildcard namespace constraint ${describeConstraint(derivedWildcard.namespaceConstraint)} must be a subset of the base type's ${describeConstraint(baseWildcard.namespaceConstraint)}.`,
                    location: loc,
                    phase: "schema-compilation",
                });
            } else if (!processContentsAtLeastAsStrict(derivedWildcard, baseWildcard)) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: `The restricted type's attribute wildcard processContents (${derivedWildcard.processContents}) must be identical to or stricter than the base's (${baseWildcard.processContents}).`,
                    location: loc,
                    phase: "schema-compilation",
                });
            }
        }
    }

    /**
     * Check whether a particle tree contains an xs:all group.
     */
    private containsAllGroup(particle: Particle | null): boolean {
        if (!particle) return false;
        const term = particle.term;
        if (term.kind === "all") return true;
        if (term.kind === "sequence" || term.kind === "choice") {
            return term.particles.some((p) => this.containsAllGroup(p));
        }
        return false;
    }

    /**
     * XSD 1.0 §3.9.6 — is `derived` a valid particle restriction of `base`?
     * Returns null when valid, or a human-readable message when invalid.
     */
    private particleRestrictionMessage(derived: Particle, base: Particle): string | null {
        // Occurrence-range subset [base.min, base.max]
        if (derived.minOccurs < base.minOccurs) {
            return `minOccurs (${derived.minOccurs}) is less than base minOccurs (${base.minOccurs}).`;
        }
        if (!this.occursWithin(derived.maxOccurs, base.maxOccurs)) {
            return `maxOccurs (${derived.maxOccurs === "unbounded" ? "unbounded" : String(derived.maxOccurs)}) exceeds base maxOccurs (${base.maxOccurs === "unbounded" ? "unbounded" : String(base.maxOccurs)}).`;
        }

        const dt = derived.term;
        const bt = base.term;

        // Both elements: names must match; derived type must restrict base type.
        if (dt.kind === "element" && bt.kind === "element") {
            if (!qnameEqual(dt.name, bt.name)) {
                return `Element ${displayQName(dt.name)} does not match the base element ${displayQName(bt.name)}.`;
            }
            if (!this.isElementTypeRestriction(dt.type, bt.type)) {
                return `Element ${displayQName(dt.name)} has a type that is not a valid restriction of the base element's type.`;
            }
            return null;
        }

        // Both sequences: ordered-subset injection.
        if (dt.kind === "sequence" && bt.kind === "sequence") {
            let j = 0;
            for (const dp of dt.particles) {
                let found = false;
                while (j < bt.particles.length) {
                    if (this.particleRestrictionMessage(dp, bt.particles[j]!) === null) {
                        found = true;
                        j++;
                        break;
                    }
                    j++;
                }
                if (!found) {
                    return `A derived particle is not a valid restriction of any remaining base particle.`;
                }
            }
            return null;
        }

        // Both choices: each derived alternative must restrict some base alternative.
        if (dt.kind === "choice" && bt.kind === "choice") {
            for (const dp of dt.particles) {
                if (!bt.particles.some((bp) => this.particleRestrictionMessage(dp, bp) === null)) {
                    return `A derived choice alternative is not a valid restriction of any base alternative.`;
                }
            }
            return null;
        }

        // Both all: CTR-all-compile already reported above; skip deep check.
        if (dt.kind === "all" && bt.kind === "all") return null;

        // Both wildcards: the derived constraint must be a subset of the base's
        // and its processContents at least as strict (§3.9.6 Wildcard:Wildcard).
        if (dt.kind === "wildcard" && bt.kind === "wildcard") {
            if (!wildcardSubset(dt.namespaceConstraint, bt.namespaceConstraint)) {
                return `The derived wildcard's namespace constraint ${describeConstraint(dt.namespaceConstraint)} is not a subset of the base wildcard's ${describeConstraint(bt.namespaceConstraint)}.`;
            }
            if (!processContentsAtLeastAsStrict(dt, bt)) {
                return `The derived wildcard's processContents (${dt.processContents}) must be identical to or stricter than the base wildcard's (${bt.processContents}).`;
            }
            return null;
        }

        // Element declaration restricting a wildcard (§3.9.6 Elt:Wildcard): the
        // element's target namespace must be allowed by the base wildcard.
        if (dt.kind === "element" && bt.kind === "wildcard") {
            if (!wildcardAllowsNamespace(bt.namespaceConstraint, dt.name.namespaceURI)) {
                return `Element ${displayQName(dt.name)} does not match the base wildcard's namespace constraint ${describeConstraint(bt.namespaceConstraint)}.`;
            }
            return null;
        }

        // A wildcard cannot restrict an element declaration.
        if (dt.kind === "wildcard" && bt.kind === "element") {
            return `A wildcard cannot be a valid restriction of the element declaration ${displayQName(bt.name)}.`;
        }

        // Otherwise, the term kinds are incompatible.
        return `Term kind "${dt.kind}" is incompatible with base term kind "${bt.kind}".`;
    }

    /**
     * Whether `derived` maxOccurs is within `base` maxOccurs.
     */
    private occursWithin(
        derived: number | "unbounded",
        base: number | "unbounded",
    ): boolean {
        if (base === "unbounded") return true;
        if (derived === "unbounded") return false;
        return derived <= base;
    }

    /**
     * Whether `sub` is a valid restriction of `base` per the type-derivation
     * chain (XSD 1.0 §2.4.1, §3.4.6).
     *
     * For complex types, every hop in the chain must be a restriction
     * (extension-derived types are not valid restrictions).
     * For simple types, all hops along the baseType chain are restrictions
     * by construction. A null type is treated as untyped (anyType or
     * anySimpleType), which accepts any derived type.
     */
    private isTypeRestriction(
        sub: TypeDefinition | null | undefined,
        base: TypeDefinition | null | undefined,
    ): boolean {
        if (!sub || !base) return false;
        if (sub === base) return true;
        const seen = new Set<TypeDefinition>();
        let cur: TypeDefinition | null = sub;
        while (cur !== base) {
            if (!cur || seen.has(cur)) return false;
            seen.add(cur);
            if (cur.kind === "complex-type") {
                if (cur.derivationMethod !== "restriction") return false;
                cur = cur.baseType;
            } else {
                cur = cur.baseType;
            }
        }
        return true;
    }

    /**
     * Whether `sub` is validly derived from `base` (XSD 1.0 §2.4.1): any
     * chain of extension and restriction derivations is accepted for complex
     * types; simple types derive by restriction along their baseType chain.
     * A null base (untyped / anyType) accepts any type.
     */
    private isValidlyDerived(sub: TypeDefinition, base: TypeDefinition): boolean {
        if (sub === base) return true;
        const seen = new Set<TypeDefinition>();
        let cur: TypeDefinition | null = sub;
        while (cur && cur !== base) {
            if (seen.has(cur)) return false;
            seen.add(cur);
            cur = cur.baseType as TypeDefinition | null;
        }
        return cur === base;
    }

    /**
     * Convenience: is the derived element's type a valid restriction of the
     * base element's type? A null base type (untyped element) accepts any
     * derived type; a null derived type does not restrict a typed base.
     */
    private isElementTypeRestriction(
        derivedType: TypeDefinition | null | undefined,
        baseType: TypeDefinition | null | undefined,
    ): boolean {
        if (!baseType) return true;
        if (!derivedType) return false;
        return this.isTypeRestriction(derivedType, baseType);
    }

    /**
     * Validate that the derived type's attribute uses form a valid restriction
     * of the base type's attribute uses (XSD 1.0 §3.4.6).
     */
    private validateAttributeRestriction(
        ctx: BuildContext,
        d: BuildContext["derivations"][number],
        base: ComplexTypeDefinition,
    ): void {
        const baseUses = new Map(base.attributeUses.map((u) => [qnameKey(u.declaration.name), u]));
        for (const use of d.type.attributeUses) {
            const key = qnameKey(use.declaration.name);
            const baseUse = baseUses.get(key);
            if (!baseUse) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: `Attribute ${displayQName(use.declaration.name)} is not declared on the base type and cannot be added by a restriction.`,
                    location: locationOf(d.node),
                    phase: "schema-compilation",
                });
                continue;
            }
            // Requiredness (derivation-ok-restriction.4): the derived use must
            // be required whenever the base use is required (restriction may
            // tighten optional→required but not relax required→optional).
            if (baseUse.required && !use.required) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_RESTRICTION",
                    message: `Attribute ${displayQName(use.declaration.name)} is required on the base type but optional on the restricted type.`,
                    location: locationOf(d.node),
                    phase: "schema-compilation",
                });
            }
            // Type restriction: derived attribute's type must restrict the
            // base attribute's type.
            const bt = baseUse.declaration.type;
            const dt = use.declaration.type;
            if (bt !== null) {
                if (dt === null) {
                    ctx.report({
                        severity: "error",
                        code: "INVALID_RESTRICTION",
                        message: `Attribute ${displayQName(use.declaration.name)} must have a type that restricts the base attribute's type.`,
                        location: locationOf(d.node),
                        phase: "schema-compilation",
                    });
                } else if (!this.isTypeRestriction(dt, bt)) {
                    ctx.report({
                        severity: "error",
                        code: "INVALID_RESTRICTION",
                        message: `Attribute ${displayQName(use.declaration.name)} type is not a valid restriction of the base attribute's type.`,
                        location: locationOf(d.node),
                        phase: "schema-compilation",
                    });
                }
            }
        }
    }

    /**
     * Post-expansion content-model checks: UPA determinism (§3.8.6) on every
     * complex type and model group definition. Runs after group expansion so
     * referenced content is analyzed inline.
     */
    private checkContentModels(ctx: BuildContext): void {
        for (const { type, node } of ctx.allComplexTypes) {
            if (type.particle) this.checkContentModelUPA(ctx, type.particle, node);
        }
        for (const { def, node } of ctx.allModelGroupDefs) {
            this.checkContentModelUPA(ctx, def.particle, node);
        }
    }

    // -----------------------------------------------------------------------
    // Pass 3 — simple type base resolution and facet computation
    // -----------------------------------------------------------------------

    /**
     * Resolve simple-type references (restriction bases, list item types,
     * union member types) and compute effective facets + whiteSpace for each
     * simple type, bottom-up along the derivation chain (CHK-010, CHK-016).
     *
     * This must run after pass-2 reference resolution so that all type refs
     * (including to built-in types) are already resolvable.
     */
    private resolveSimpleTypes(ctx: BuildContext, grammars: Map<string, CompiledGrammar>): void {
        // Phase 1: resolve references.
        // - atomic restrictions: itemType is the restriction base → baseType
        // - list definitions: itemType is the item type → itemTypeDef
        //   (an inline anonymous item type is already attached at build time)
        // - union definitions: memberTypes are the member types → memberTypeDefs
        //   (inline anonymous members are already attached at build time)
        for (const st of ctx.allSimpleTypes) {
            if (st.variety === "union") {
                const resolvedMembers: SimpleTypeDefinition[] = [];
                for (const ref of st.memberTypes) {
                    const resolved = this.lookupType(grammars, ref);
                    if (resolved && resolved.kind === "simple-type") {
                        if (resolved.final.split(/\s+/).includes("union")) {
                            ctx.report({
                                severity: "error",
                                code: "INVALID_FINAL",
                                message: `Union member type ${displayQName(ref)} is final with respect to union and cannot be a member of a union.`,
                                location: { line: 0, column: 0 },
                                phase: "schema-compilation",
                            });
                        }
                        resolvedMembers.push(resolved);
                    } else if (resolved) {
                        ctx.report({
                            severity: "error",
                            code: "UNRESOLVED_TYPE",
                            message: `Union member type ${displayQName(ref)} must be a simple type.`,
                            location: { line: 0, column: 0 },
                            phase: "schema-compilation",
                        });
                    }
                    // resolved == null: UNRESOLVED_TYPE already reported in pass 2.
                }
                (st as { memberTypeDefs: ReadonlyArray<SimpleTypeDefinition> }).memberTypeDefs = [
                    ...resolvedMembers,
                    ...st.memberTypeDefs,
                ];
                continue;
            }
            const ref = st.itemType;
            if (!ref) continue;
            const resolved = this.lookupType(grammars, ref);
            if (!resolved) continue; // pass 2 already reported it
            if (resolved.kind !== "simple-type") {
                // A simpleContent restriction may restrict a complex type with
                // simple content (CHK-020). Its effective simple-type base is
                // the base complex type's {simple type}.
                // A simpleContent restriction may restrict a complex type with
                // simple content (CHK-020). Its effective simple-type base is
                // the base complex type's {simple type}.
                if (ctx.simpleContentRestrictions.has(st) && resolved.kind === "complex-type" && resolved.simpleType) {
                    if (resolved.final.split(/\s+/).includes("restriction")) {
                        ctx.report({
                            severity: "error",
                            code: "INVALID_FINAL",
                            message: `Base type ${displayQName(ref)} is final with respect to restriction and cannot be the base of a simpleContent restriction.`,
                            location: { line: 0, column: 0 },
                            phase: "schema-compilation",
                        });
                    }
                    (st as { baseType: SimpleTypeDefinition | null }).baseType = resolved.simpleType;
                    continue;
                }
                ctx.report({
                    severity: "error",
                    code: "UNRESOLVED_TYPE",
                    message: `${st.variety === "list" ? "List item" : "Restriction base"} type ${displayQName(ref)} must be a simple type.`,
                    location: { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
                continue;
            }
            if (st.variety === "list") {
                if (resolved.final.split(/\s+/).includes("list")) {
                    ctx.report({
                        severity: "error",
                        code: "INVALID_FINAL",
                        message: `List item type ${displayQName(ref)} is final with respect to list and cannot be used as a list item type.`,
                        location: { line: 0, column: 0 },
                        phase: "schema-compilation",
                    });
                }
                (st as { itemTypeDef: SimpleTypeDefinition | null }).itemTypeDef = resolved;
            } else {
                if (resolved.final.split(/\s+/).includes("restriction")) {
                    ctx.report({
                        severity: "error",
                        code: "INVALID_FINAL",
                        message: `Restriction base type ${displayQName(ref)} is final with respect to restriction and cannot be the base of a restriction.`,
                        location: { line: 0, column: 0 },
                        phase: "schema-compilation",
                    });
                }
                (st as { baseType: SimpleTypeDefinition | null }).baseType = resolved;
            }
        }

        // Phase 2: a restriction of a list/union base inherits the base's
        // variety (a restriction of xs:list is itself a list, XSD 1.0 §3.4.1).
        for (const st of ctx.allSimpleTypes) {
            if (st.variety === "atomic" && st.baseType && st.baseType.variety !== "atomic") {
                (st as { variety: "list" | "union" }).variety = st.baseType.variety;
            }
        }

        // Phase 3: compute effective facets and whiteSpace bottom-up
        // (bases are resolved; recursion terminates at baseType = null).
        // Item/member definitions are inherited down restriction chains.
        const computed = new Set<SimpleTypeDefinition>();
        const compute = (st: SimpleTypeDefinition) => {
            if (computed.has(st)) return;
            const base = st.baseType;
            if (base) compute(base);
            // Built-in types are deep-frozen at module load with their facets
            // precomputed (builtinTypes.ts); skip them.
            if (Object.isFrozen(st)) {
                computed.add(st);
                return;
            }
            // A list restricted from another list keeps the base's item type;
            // a union restricted from another union keeps the base's members.
            if (st.variety === "list" && !st.itemTypeDef && base) {
                (st as { itemTypeDef: SimpleTypeDefinition | null }).itemTypeDef = base.itemTypeDef;
            }
            if (st.variety === "union" && st.memberTypeDefs.length === 0 && base) {
                (st as { memberTypeDefs: ReadonlyArray<SimpleTypeDefinition> }).memberTypeDefs = base.memberTypeDefs;
            }
            const eff = computeEffectiveFacets(st.facets, base);
            // whiteSpace is fixed for list (collapse) and union (preserve)
            // varieties (XSD 1.0 Part 2 §3.4.1/§3.4.2); restrictions inherit
            // through the base chain for atomic types.
            const ws = st.variety === "list"
                ? "collapse"
                : st.variety === "union"
                    ? "preserve"
                    : computeWhiteSpace(st.facets, base);
            (st as { effectiveFacets: ReadonlyArray<Facet> }).effectiveFacets = eff;
            (st as { whiteSpace: WhiteSpaceValue }).whiteSpace = ws;
            computed.add(st);
        };
        for (const st of ctx.allSimpleTypes) {
            compute(st);
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private trackRef(ctx: BuildContext, node: Element, ref: QName): void {
        ctx.refs.push({ ref, node });
    }

    // -----------------------------------------------------------------------
    // Declaration-attribute helpers (CHK-023)
    // -----------------------------------------------------------------------

    /**
     * Normalize a whitespace-separated token list (block/final/blockDefault/
     * finalDefault): an explicit `#all` expands to every allowed token, and
     * unknown tokens are dropped. When `raw` is null, `defaults` is used.
     */
    private normalizeTokens(raw: string | null, defaults: string, allowed: readonly string[]): string {
        const value = raw ?? defaults;
        if (!value) return "";
        const tokens = value.trim().split(/\s+/);
        if (tokens.includes("#all")) return allowed.join(" ");
        return tokens.filter((t) => allowed.includes(t)).join(" ");
    }

    /** The complex type's final token list: own final attribute, else finalDefault. */
    private finalForComplexType(el: Element, ctx: BuildContext): string {
        const raw = el.getAttribute("final");
        return this.normalizeTokens(raw, this.filterTokens(ctx.finalDefault, COMPLEX_FINAL_TOKENS), COMPLEX_FINAL_TOKENS);
    }

    /** The simple type's final token list: own final attribute, else finalDefault. */
    private finalForSimpleType(el: Element, ctx: BuildContext): string {
        const raw = el.getAttribute("final");
        return this.normalizeTokens(raw, this.filterTokens(ctx.finalDefault, SIMPLE_FINAL_TOKENS), SIMPLE_FINAL_TOKENS);
    }

    /** Keep only the tokens of `value` that appear in `allowed`. */
    private filterTokens(value: string, allowed: readonly string[]): string {
        if (!value) return "";
        return value.trim().split(/\s+/).filter((t) => allowed.includes(t)).join(" ");
    }

    /**
     * XSD 1.0 §3.3.2 (element declaration properties correct): default and
     * fixed are mutually exclusive. Reported at build time.
     */
    private checkValueConstraint(decl: ElementDeclaration, el: Element, ctx: BuildContext): void {
        if (decl.default !== null && decl.fixed !== null) {
            ctx.report({
                severity: "error",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: `Element ${displayQName(decl.name)} declares both a default and a fixed value constraint; they are mutually exclusive.`,
                location: locationOf(el),
                phase: "schema-compilation",
            });
        }
    }

    private readQName(el: Element, attrName: string, ctx: BuildContext): QName | null {
        const value = el.getAttribute(attrName);
        if (!value) return null;
        return this.readQNameString(el, value, ctx);
    }

    private readQNameString(el: Element, value: string, ctx: BuildContext): QName | null {
        const colon = value.indexOf(":");
        let q: QName;
        if (colon === -1) {
            // The default namespace: per Namespaces in XML an unprefixed QName
            // resolves against it. xmldom stores it under the '' key, so a
            // null lookup must fall back to an empty-string lookup.
            const namespaceURI = el.lookupNamespaceURI(null) ?? el.lookupNamespaceURI("");
            q = { namespaceURI, localName: value };
        } else {
            const prefix = value.slice(0, colon);
            const localName = value.slice(colon + 1);
            q = { namespaceURI: el.lookupNamespaceURI(prefix), localName };
        }
        // Inside a redefining schema document, references to a redefined name
        // resolve to the original (pre-redefinition) component (XSD 1.0 §4.2.3).
        if (ctx.refRewrite) return ctx.refRewrite(q);
        return q;
    }

    private readOccurs(el: Element, attrName: string, fallback: number): number {
        const raw = el.getAttribute(attrName);
        if (!raw) return fallback;
        const n = Number.parseInt(raw, 10);
        return Number.isFinite(n) ? n : fallback;
    }

    /**
     * Validate all-group occurrence limits per XSD 1.0 §3.8.4:
     * minOccurs ∈ {0, 1}, maxOccurs = 1; all children minOccurs ∈ {0, 1}, maxOccurs = 1.
     */
    private validateAllGroup(ctx: BuildContext, particle: Particle, el: Element): void {
        if (particle.minOccurs < 0 || particle.minOccurs > 1) {
            ctx.report({
                severity: "error",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: `xs:all minOccurs must be 0 or 1, got ${particle.minOccurs}.`,
                location: locationOf(el),
                phase: "schema-compilation",
            });
        }
        if (particle.maxOccurs !== 1) {
            ctx.report({
                severity: "error",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: `xs:all maxOccurs must be 1, got ${particle.maxOccurs === "unbounded" ? "unbounded" : String(particle.maxOccurs)}.`,
                location: locationOf(el),
                phase: "schema-compilation",
            });
        }
        // Validate children
        const group = particle.term as ModelGroup;
        for (const child of group.particles) {
            const childEl = ctx.particleNodes.get(child);
            // In XSD 1.0, xs:all can only contain element declarations, not group refs.
            if (child.term.kind !== "element") {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: "An xs:all-group can only contain xs:element children (not group references).",
                    location: childEl ? locationOf(childEl) : { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            }
            if (child.minOccurs < 0 || child.minOccurs > 1) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `An xs:all child particle minOccurs must be 0 or 1, got ${child.minOccurs}.`,
                    location: childEl ? locationOf(childEl) : { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            }
            if (child.maxOccurs !== 1) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_SCHEMA_DOCUMENT",
                    message: `An xs:all child particle maxOccurs must be 1, got ${child.maxOccurs === "unbounded" ? "unbounded" : String(child.maxOccurs)}.`,
                    location: childEl ? locationOf(childEl) : { line: 0, column: 0 },
                    phase: "schema-compilation",
                });
            }
        }
    }

    /**
     * Run UPA (Unique Particle Attribution) determinism check on a content-model particle.
     * Reports AMBIGUOUS_CONTENT_MODEL errors for any violation.
     */
    private checkContentModelUPA(ctx: BuildContext, particle: Particle, el: Element): void {
        const violations = checkUPA(particle);
        for (const v of violations) {
            ctx.report({
                severity: "error",
                code: "AMBIGUOUS_CONTENT_MODEL",
                message: v.message,
                location: locationOf(el),
                phase: "schema-compilation",
            });
        }
    }

    private checkPatternFacets(facets: ReadonlyArray<{ kind: string; value: string; node: Element }>, ctx: BuildContext): void {
        for (const f of facets) {
            if (f.kind !== "pattern") continue;
            try {
                compileXsdRegex(f.value);
            } catch (e) {
                ctx.report({
                    severity: "error",
                    code: "INVALID_PATTERN",
                    message: `The pattern facet value '${f.value}' is not a valid XSD regular expression: ${e instanceof XsdRegexError ? e.message : String(e)}`,
                    location: locationOf(f.node),
                    phase: "schema-compilation",
                });
            }
        }
    }

    private readFacets(el: Element): Array<{ kind: string; value: string; node: Element }> {
        const FACET_NAMES = [
            "length",
            "minLength",
            "maxLength",
            "pattern",
            "enumeration",
            "whiteSpace",
            "maxInclusive",
            "maxExclusive",
            "minInclusive",
            "minExclusive",
            "totalDigits",
            "fractionDigits",
        ];
        const facets: Array<{ kind: string; value: string; node: Element }> = [];
        for (const child of childElements(el)) {
            const localName = child.localName ?? "";
            if (child.namespaceURI !== NAMESPACE_XSD || !FACET_NAMES.includes(localName)) continue;
            const value = child.getAttribute("value");
            if (value !== null) facets.push({ kind: localName, value, node: child });
        }
        return facets;
    }

    private parseSchemaRoot(xsd: string, report: (error: SchemaError) => void): Element | null {
        let doc: Document;
        try {
            doc = this.xmlParser.parse(xsd);
        } catch {
            report({
                severity: "fatal",
                code: "INVALID_SCHEMA_DOCUMENT",
                message: "The schema document is not well-formed XML.",
                location: { line: 0, column: 0 },
                phase: "schema-compilation",
            });
            return null;
        }
        return doc.documentElement ?? null;
    }
}