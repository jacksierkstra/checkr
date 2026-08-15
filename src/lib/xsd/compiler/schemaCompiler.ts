import { Document, Element } from "@xmldom/xmldom";
import {
    AttributeDeclaration,
    AttributeGroupDefinition,
    AttributeUse,
    ComplexTypeDefinition,
    CompiledGrammar,
    CompiledSchema,
    ElementDeclaration,
    Facet,
    ModelGroup,
    ModelGroupDefinition,
    Particle,
    ParticleTerm,
    QName,
    SimpleTypeDefinition,
    TypeDefinition,
    WhiteSpaceValue,
    Wildcard,
    displayQName,
    qnameKey,
} from "@lib/types/component-graph";
import { deepFreeze } from "@lib/types/immutable";
import { namespaceKey, NAMESPACE_XSD } from "@lib/types/namespaces";
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
            locations: new Map(),
            particleNodes: new Map(),
            attributeGroupRefNodes: new Map(),
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

        // Pass 3 — resolve simple-type bases and compute effective facets/whiteSpace.
        this.resolveSimpleTypes(ctx, grammars);

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

        const contentChildren: Element[] = [];
        const attrChildren: Element[] = [];
        for (const child of childElements(el)) {
            if (child.namespaceURI !== NAMESPACE_XSD) continue;
            if (child.localName === "attribute" || child.localName === "attributeGroup" || child.localName === "anyAttribute") {
                attrChildren.push(child);
            } else {
                contentChildren.push(child);
            }
        }

        let particle: Particle | null = null;
        let contentType: "element-only" | "simple" | "mixed" | "empty" = "empty";
        let simpleType: SimpleTypeDefinition | null = null;

        const contentChild = contentChildren[0];
        if (contentChild) {
            switch (contentChild.localName) {
                case "sequence":
                case "choice":
                case "all":
                    particle = this.wrapParticle(ctx, contentChild, this.buildModelGroup(contentChild, ctx));
                    contentType = "element-only";
                    // Validate all-group occurrence limits (XSD 1.0 §3.8.4)
                    if (contentChild.localName === "all") {
                        this.validateAllGroup(ctx, particle, contentChild);
                    }
                    break;
                case "any":
                    particle = this.buildAnyParticle(contentChild, ctx);
                    contentType = "element-only";
                    break;
                case "simpleContent":
                    simpleType = this.buildSimpleContent(contentChild, ctx);
                    contentType = "simple";
                    break;
                case "complexContent":
                    ctx.report({
                        severity: "warning",
                        code: "UNSUPPORTED_FEATURE",
                        message: "xs:complexContent derivation is not supported yet; the type compiles as empty content.",
                        location: locationOf(contentChild),
                        phase: "schema-compilation",
                    });
                    contentType = "empty";
                    break;
                default:
                    break;
            }
        }

        const attributeUses: AttributeUse[] = [];
        for (const child of attrChildren) {
            if (child.localName === "attribute") {
                const use = this.buildAttributeUse(child, ctx);
                if (use) attributeUses.push(use);
            } else if (child.localName === "anyAttribute") {
                ctx.report({
                    severity: "warning",
                    code: "UNSUPPORTED_FEATURE",
                    message: "xs:anyAttribute is not supported yet.",
                    location: locationOf(child),
                    phase: "schema-compilation",
                });
            } else if (child.localName === "attributeGroup") {
                const ref = this.readQName(child, "ref");
                if (ref) {
                    const placeholder = this.placeholderAttributeGroupUse(child, ref);
                    ctx.attributeGroupRefNodes.set(placeholder, child);
                    attributeUses.push(placeholder);
                } else {
                    ctx.report({
                        severity: "error",
                        code: "INVALID_SCHEMA_DOCUMENT",
                        message: "An xs:attributeGroup reference must carry a ref attribute.",
                        location: locationOf(child),
                        phase: "schema-compilation",
                    });
                }
            }
        }

        const result: ComplexTypeDefinition = {
            kind: "complex-type", name, contentType, particle, attributeUses, simpleType,
        };
        ctx.allComplexTypes.push({ type: result, node: el });
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

    private buildSimpleContent(el: Element, ctx: BuildContext): SimpleTypeDefinition {
        const derivation = childElements(el).find(
            (c) =>
                c.namespaceURI === NAMESPACE_XSD &&
                (c.localName === "restriction" || c.localName === "extension")
        );
        const base = derivation ? this.readQName(derivation, "base") : null;
        if (base) this.trackRef(ctx, derivation ?? el, base);
        const st: SimpleTypeDefinition = {
            kind: "simple-type",
            name: null,
            variety: "atomic",
            itemType: base,
            memberTypes: [],
            itemTypeDef: null,
            memberTypeDefs: [],
            facets: derivation?.localName === "restriction" ? this.readFacets(derivation) : [], baseType: null, whiteSpace: "preserve", effectiveFacets: [],
        };
        if (derivation?.localName === "restriction") this.checkPatternFacets(this.readFacets(derivation), ctx);
        ctx.allSimpleTypes.push(st);
        return st;
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
        const attributeUses: AttributeUse[] = [];
        for (const child of childElements(el)) {
            if (child.namespaceURI !== NAMESPACE_XSD) continue;
            if (child.localName === "attribute") {
                const use = this.buildAttributeUse(child, ctx);
                if (use) attributeUses.push(use);
            } else if (child.localName === "attributeGroup") {
                const ref = this.readQName(child, "ref");
                if (ref) {
                    const placeholder = this.placeholderAttributeGroupUse(child, ref);
                    ctx.attributeGroupRefNodes.set(placeholder, child);
                    attributeUses.push(placeholder);
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
                ctx.report({
                    severity: "warning",
                    code: "UNSUPPORTED_FEATURE",
                    message: "xs:anyAttribute is not supported yet.",
                    location: locationOf(child),
                    phase: "schema-compilation",
                });
            }
        }
        const def: AttributeGroupDefinition = {
            kind: "attribute-group-definition",
            name: { namespaceURI: ctx.targetNamespace, localName },
            attributeUses,
        };
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
        ctx.report({
            severity: "warning",
            code: "UNSUPPORTED_FEATURE",
            message: "Wildcard content (xs:any) is compiled but not validated yet.",
            location: locationOf(el),
            phase: "schema-compilation",
        });
        return this.wrapParticle(ctx, el, this.buildWildcard(el));
    }

    private buildWildcard(el: Element): Wildcard {
        const processContents = (el.getAttribute("processContents") ?? "strict") as "strict" | "lax" | "skip";
        return { kind: "wildcard", processContents };
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