import { Document, Element } from "@xmldom/xmldom";
import {
    AttributeDeclaration,
    AttributeUse,
    ComplexTypeDefinition,
    CompiledGrammar,
    CompiledSchema,
    ElementDeclaration,
    Facet,
    ModelGroup,
    Particle,
    ParticleTerm,
    QName,
    SimpleTypeDefinition,
    TypeDefinition,
    WhiteSpaceValue,
    Wildcard,
    displayQName,
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
    /** Every remaining QName reference (simple-type bases, union members, element refs). */
    refs: Array<{ ref: QName; node: Element }>;
    /** Every simple type definition built during pass 1, for pass 2 facet resolution. */
    allSimpleTypes: SimpleTypeDefinition[];
    /** Source location of each element declaration, for compile-error reporting. */
    locations: Map<ElementDeclaration, SchemaLocation>;
    report: (error: SchemaError) => void;
}

/** Limit constant for `unbounded`. */
const UNBOUNDED = "unbounded";

interface MutableGrammar {
    namespaceURI: string | null;
    elements: Map<string, ElementDeclaration>;
    types: Map<string, TypeDefinition>;
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
                types: new Map(),
            },
            allElements: [],
            allAttributes: [],
            refs: [],
            allSimpleTypes: [],
            locations: new Map(),
            report,
        };

        // Pass 1 — register global components.
        for (const child of childElements(root)) {
            if (child.namespaceURI !== NAMESPACE_XSD) continue;
            if (child.localName === "element") {
                const decl = this.buildGlobalElement(child, ctx);
                ctx.grammar.elements.set(decl.name.localName, decl);
            } else if (child.localName === "complexType") {
                const type = this.buildComplexType(child, ctx, ctx.targetNamespace);
                if (type.name) ctx.grammar.types.set(type.name.localName, type);
            } else if (child.localName === "simpleType") {
                const type = this.buildSimpleType(child, ctx, ctx.targetNamespace);
                if (type.name) ctx.grammar.types.set(type.name.localName, type);
            }
            // include/import/redefine/annotation/notation/group/attributeGroup: later tickets.
        }

        const grammars = new Map<string, CompiledGrammar>();
        grammars.set(NAMESPACE_XSD, BUILTIN_GRAMMAR);
        grammars.set(namespaceKey(ctx.targetNamespace), ctx.grammar);

        // Pass 2 — eager multi-pass reference resolution (AD §5).
        this.resolveReferencePass(ctx, grammars);

        // Pass 3 — resolve simple-type bases and compute effective facets/whiteSpace.
        this.resolveSimpleTypes(ctx, grammars);

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
        };
        ctx.locations.set(decl, locationOf(el));
        ctx.allElements.push(decl);
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
                    particle = this.wrapParticle(contentChild, this.buildModelGroup(contentChild, ctx));
                    contentType = "element-only";
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
            } else {
                ctx.report({
                    severity: "warning",
                    code: "UNSUPPORTED_FEATURE",
                    message: "xs:attributeGroup references are not supported yet.",
                    location: locationOf(child),
                    phase: "schema-compilation",
                });
            }
        }

        return { kind: "complex-type", name, contentType, particle, attributeUses, simpleType };
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
                itemType: null, memberTypes: [], facets: [],
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
                    facets: this.readFacets(derivation),
                    baseType: null,
                    whiteSpace: "preserve",
                    effectiveFacets: [],
                };
                break;
            }
            case "list": {
                const itemType = this.readQName(derivation, "itemType");
                if (itemType) this.trackRef(ctx, derivation, itemType);
                result = {
                    kind: "simple-type", name, variety: "list",
                    itemType, memberTypes: [], facets: [],
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
                result = {
                    kind: "simple-type", name, variety: "union",
                    itemType: null, memberTypes, facets: [],
                    baseType: null, whiteSpace: "preserve", effectiveFacets: [],
                };
                break;
            }
            default:
                result = {
                    kind: "simple-type", name, variety: "atomic",
                    itemType: null, memberTypes: [], facets: [],
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
            facets: derivation?.localName === "restriction" ? this.readFacets(derivation) : [],
            baseType: null,
            whiteSpace: "preserve",
            effectiveFacets: [],
        };
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
                    particles.push(this.wrapParticle(child, this.buildModelGroup(child, ctx)));
                    break;
                case "any":
                    particles.push(this.buildAnyParticle(child, ctx));
                    break;
                case "group":
                    ctx.report({
                        severity: "warning",
                        code: "UNSUPPORTED_FEATURE",
                        message: "Named model group references (xs:group) are not supported yet.",
                        location: locationOf(child),
                        phase: "schema-compilation",
                    });
                    break;
                default:
                    break; // annotation
            }
        }
        return { kind: el.localName as "sequence" | "choice" | "all", particles };
    }

    private buildLocalElementParticle(el: Element, ctx: BuildContext): Particle {
        const refAttr = this.readQName(el, "ref");
        const inlineType = this.readQName(el, "type") ? null : this.buildInlineType(el, ctx);
        const decl: ElementDeclaration = {
            kind: "element",
            scope: "local",
            name: this.localElementName(el, ctx),
            typeRef: this.readQName(el, "type"),
            type: inlineType,
            nillable: el.getAttribute("nillable") === "true",
        };
        if (refAttr) {
            ctx.report({
                severity: "warning",
                code: "UNSUPPORTED_FEATURE",
                message: `Element references (ref="${displayQName(refAttr)}") are not supported yet; compiled as a local declaration.`,
                location: locationOf(el),
                phase: "schema-compilation",
            });
            this.trackRef(ctx, el, refAttr);
            // Best-effort: give the local stand-in the referenced element's identity so
            // content matching still works for the resolved case.
            (decl as { name: QName }).name = { namespaceURI: refAttr.namespaceURI, localName: refAttr.localName };
            (decl as { type: TypeDefinition | null }).type = null;
            (decl as { typeRef: QName | null }).typeRef = null;
        }
        ctx.locations.set(decl, locationOf(el));
        ctx.allElements.push(decl);
        return this.wrapParticle(el, decl);
    }

    private buildAttributeUse(el: Element, ctx: BuildContext): AttributeUse | null {
        const name = this.localAttributeName(el, ctx);
        const typeRef = this.readQName(el, "type");
        const decl: AttributeDeclaration = {
            kind: "attribute",
            name,
            typeRef,
            type: null,
        };
        if (el.getAttribute("ref")) {
            ctx.report({
                severity: "warning",
                code: "UNSUPPORTED_FEATURE",
                message: "Attribute references (ref=) are not supported yet.",
                location: locationOf(el),
                phase: "schema-compilation",
            });
        }
        ctx.allAttributes.push(decl);
        const use = el.getAttribute("use") ?? "optional";
        return {
            declaration: decl,
            required: use === "required",
            fixed: el.getAttribute("fixed") ?? null,
            defaultValue: el.getAttribute("default") ?? null,
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
        return this.wrapParticle(el, this.buildWildcard(el));
    }

    private buildWildcard(el: Element): Wildcard {
        const processContents = (el.getAttribute("processContents") ?? "strict") as "strict" | "lax" | "skip";
        return { kind: "wildcard", processContents };
    }

    private wrapParticle(el: Element, term: ParticleTerm): Particle {
        const minOccurs = this.readOccurs(el, "minOccurs", 1);
        const maxRaw = el.getAttribute("maxOccurs");
        const maxOccurs = maxRaw === UNBOUNDED ? UNBOUNDED : this.readOccurs(el, "maxOccurs", 1);
        return { minOccurs, maxOccurs, term };
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
    }

    private lookupType(grammars: Map<string, CompiledGrammar>, q: QName): TypeDefinition | null {
        return grammars.get(namespaceKey(q.namespaceURI))?.types.get(q.localName) ?? null;
    }

    private lookupElement(grammars: Map<string, CompiledGrammar>, q: QName): ElementDeclaration | null {
        return grammars.get(namespaceKey(q.namespaceURI))?.elements.get(q.localName) ?? null;
    }

    // -----------------------------------------------------------------------
    // Pass 3 — simple type base resolution and facet computation
    // -----------------------------------------------------------------------

    /**
     * Resolve simple-type base references (restriction bases, list item types)
     * and compute effective facets + whiteSpace for each simple type.
     *
     * This must run after pass-2 reference resolution so that all type refs
     * (including to built-in types) are already resolvable.
     */
    private resolveSimpleTypes(ctx: BuildContext, grammars: Map<string, CompiledGrammar>): void {
        // Phase 1: resolve baseType references
        for (const st of ctx.allSimpleTypes) {
            if (st.variety === "union") continue;
            const ref = st.itemType;
            if (!ref) continue;
            const resolved = this.lookupType(grammars, ref);
            if (resolved && resolved.kind === "simple-type") {
                (st as { baseType: SimpleTypeDefinition | null }).baseType = resolved;
            }
        }

        // Phase 2: compute effective facets and whiteSpace bottom-up
        // (bases are resolved; recursion terminates at baseType = null).
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
            const eff = computeEffectiveFacets(st.facets, base);
            const ws = computeWhiteSpace(st.facets, base);
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

    private readFacets(el: Element): Array<{ kind: string; value: string }> {
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
        const facets: Array<{ kind: string; value: string }> = [];
        for (const child of childElements(el)) {
            const localName = child.localName ?? "";
            if (child.namespaceURI !== NAMESPACE_XSD || !FACET_NAMES.includes(localName)) continue;
            const value = child.getAttribute("value");
            if (value !== null) facets.push({ kind: localName, value });
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