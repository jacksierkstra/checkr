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

export interface CompileOptions {
    listener?: SchemaErrorListener;
}

export interface SchemaCompiler {
    compile(xsd: string, options?: CompileOptions): CompiledSchema;
}

interface BuildContext {
    targetNamespace: string | null;
    elementFormDefault: boolean;
    attributeFormDefault: boolean;
    /** Mutable during pass 1; frozen as part of the final CompiledSchema. */
    grammar: MutableGrammar;
    /** Every element declaration built during pass 1, for pass 2 resolution. */
    allElements: ElementDeclaration[];
    /** Every attribute declaration built during pass 1, for pass 2 resolution. */
    allAttributes: AttributeDeclaration[];
    /** Every remaining QName reference (simple-type bases, union members). */
    refs: Array<{ ref: QName; node: Element }>;
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
    report: (error: SchemaError) => void;
}

/** Limit constant for `unbounded`. */
const UNBOUNDED = "unbounded";

interface MutableGrammar {
    namespaceURI: string | null;
    elements: Map<string, ElementDeclaration>;
    attributes: Map<string, AttributeDeclaration>;
    types: Map<string, TypeDefinition>;
    modelGroups: Map<string, ModelGroupDefinition>;
    attributeGroups: Map<string, AttributeGroupDefinition>;
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

        const ctx: BuildContext = {
            targetNamespace: root.getAttribute("targetNamespace") || null,
            elementFormDefault: root.getAttribute("elementFormDefault") === "qualified",
            attributeFormDefault: root.getAttribute("attributeFormDefault") === "qualified",
            grammar: {
                namespaceURI: root.getAttribute("targetNamespace") || null,
                elements: new Map(),
                attributes: new Map(),
                types: new Map(),
                modelGroups: new Map(),
                attributeGroups: new Map(),
            },
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
            report,
        };

        // Pass 1 — register global components.
        for (const child of childElements(root)) {
            if (child.namespaceURI !== NAMESPACE_XSD) continue;
            if (child.localName === "element") {
                const decl = this.buildGlobalElement(child, ctx);
                ctx.grammar.elements.set(decl.name.localName, decl);
            } else if (child.localName === "attribute") {
                const decl = this.buildGlobalAttribute(child, ctx);
                if (decl) ctx.grammar.attributes.set(decl.name.localName, decl);
            } else if (child.localName === "complexType") {
                const type = this.buildComplexType(child, ctx, ctx.targetNamespace);
                if (type.name) ctx.grammar.types.set(type.name.localName, type);
            } else if (child.localName === "simpleType") {
                const type = this.buildSimpleType(child, ctx, ctx.targetNamespace);
                if (type.name) ctx.grammar.types.set(type.name.localName, type);
            } else if (child.localName === "group") {
                const def = this.buildModelGroupDefinition(child, ctx);
                if (def) ctx.grammar.modelGroups.set(def.name.localName, def);
            } else if (child.localName === "attributeGroup") {
                const def = this.buildAttributeGroupDefinition(child, ctx);
                if (def) ctx.grammar.attributeGroups.set(def.name.localName, def);
            }
            // include/import/redefine/annotation/notation: later tickets.
        }

        const grammars = new Map<string, CompiledGrammar>();
        grammars.set(NAMESPACE_XSD, BUILTIN_GRAMMAR);
        grammars.set(namespaceKey(ctx.targetNamespace), ctx.grammar);

        // Pass 2 — eager multi-pass reference resolution (AD §5).
        this.resolveReferencePass(ctx, grammars);

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
        const typeRef = this.readQName(el, "type");
        const inlineType = typeRef ? null : this.buildInlineType(el, ctx);
        const decl: ElementDeclaration = {
            kind: "element",
            scope: "global",
            name,
            typeRef,
            type: inlineType,
            nillable: el.getAttribute("nillable") === "true",
            ref: null,
        };
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
            typeRef: this.readQName(el, "type"),
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
                    baseRef = this.readQName(derivation, "base");
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
                    baseRef = this.readQName(derivation, "base");
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
            };
            ctx.allSimpleTypes.push(st);
            return st;
        }

        let result: SimpleTypeDefinition;
        switch (derivation.localName) {
            case "restriction": {
                const base = this.readQName(derivation, "base");
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
                };
                this.checkPatternFacets(this.readFacets(derivation), ctx);
                break;
            }
            case "list": {
                const itemType = this.readQName(derivation, "itemType");
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
                };
                break;
            }
            case "union": {
                const memberTypes: QName[] = [];
                const raw = derivation.getAttribute("memberTypes");
                if (raw) {
                    for (const part of raw.trim().split(/\s+/)) {
                        const member = this.readQNameString(derivation, part);
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
                };
                break;
            }
            default:
                result = {
                    kind: "simple-type", name, variety: "atomic",
                    itemType: null, memberTypes: [], itemTypeDef: null, memberTypeDefs: [], facets: [],
                    baseType: null, whiteSpace: "preserve", effectiveFacets: [],
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
        const base = this.readQName(el, "base");
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
                const ref = this.readQName(child, "ref");
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
                    const ref = this.readQName(child, "ref");
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
        const refAttr = this.readQName(el, "ref");
        const typeRef = refAttr ? null : this.readQName(el, "type");
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
        };
        ctx.locations.set(decl, locationOf(el));
        ctx.allElements.push(decl);
        return this.wrapParticle(ctx, el, decl);
    }

    private buildAttributeUse(el: Element, ctx: BuildContext): AttributeUse | null {
        const refAttr = this.readQName(el, "ref");
        const typeRef = refAttr ? null : this.readQName(el, "type");
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
                if (ctx.simpleContentRestrictions.has(st) && resolved.kind === "complex-type" && resolved.simpleType) {
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
                (st as { itemTypeDef: SimpleTypeDefinition | null }).itemTypeDef = resolved;
            } else {
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

    private readQName(el: Element, attrName: string): QName | null {
        const value = el.getAttribute(attrName);
        if (!value) return null;
        return this.readQNameString(el, value);
    }

    private readQNameString(el: Element, value: string): QName | null {
        const colon = value.indexOf(":");
        if (colon === -1) {
            return { namespaceURI: el.lookupNamespaceURI(null), localName: value };
        }
        const prefix = value.slice(0, colon);
        const localName = value.slice(colon + 1);
        return { namespaceURI: el.lookupNamespaceURI(prefix), localName };
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