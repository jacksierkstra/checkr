/**
 * Typed component graph mirroring the XSD 1.0 Part 1 component model
 * (see docs/adr/architecture-component-model.md §1).
 *
 * Named components are identified by QName `{namespaceURI}localName`.
 * Anonymous components (inline types, unnamed model groups) carry `name: null`.
 * Every component is `readonly`; the outermost `CompiledSchema` is deep-frozen
 * by the compiler before it is returned.
 */

export interface QName {
    namespaceURI: string | null;
    localName: string;
}

/** Stable string key for a QName, e.g. `"{http://example.com}foo"`. */
export function qnameKey(q: QName): string {
    return `{${q.namespaceURI ?? ""}}${q.localName}`;
}

/** Structural equality for two QNames. */
export function qnameEqual(a: QName, b: QName): boolean {
    return (a.namespaceURI ?? null) === (b.namespaceURI ?? null) && a.localName === b.localName;
}

/** Human-readable form of a QName, e.g. `"{http://example.com}foo"` or `"foo"`. */
export function displayQName(q: QName): string {
    return q.namespaceURI ? `{${q.namespaceURI}}${q.localName}` : q.localName;
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export type SimpleTypeVariety = "atomic" | "list" | "union";

export interface Facet {
    readonly kind: string;
    readonly value: string;
}

export interface SimpleTypeDefinition {
    readonly kind: "simple-type";
    readonly name: QName | null;
    readonly variety: SimpleTypeVariety;
    readonly itemType: QName | null;
    readonly memberTypes: ReadonlyArray<QName>;
    readonly facets: ReadonlyArray<Facet>;
}

export type ContentType = "element-only" | "simple" | "mixed" | "empty";

export interface ComplexTypeDefinition {
    readonly kind: "complex-type";
    readonly name: QName | null;
    readonly contentType: ContentType;
    readonly particle: Particle | null;
    readonly attributeUses: ReadonlyArray<AttributeUse>;
    /** When `contentType` is `"simple"`, the underlying simple type. */
    readonly simpleType: SimpleTypeDefinition | null;
}

export type TypeDefinition = SimpleTypeDefinition | ComplexTypeDefinition;

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

export interface ElementDeclaration {
    readonly kind: "element";
    readonly scope: "global" | "local";
    readonly name: QName;
    /** The original QName reference from the schema (null = inline type). */
    readonly typeRef: QName | null;
    /** The resolved type definition (set at compile time). */
    readonly type: TypeDefinition | null;
    readonly nillable: boolean;
}

export interface AttributeDeclaration {
    readonly kind: "attribute";
    readonly name: QName;
    readonly typeRef: QName | null;
    readonly type: SimpleTypeDefinition | null;
}

export interface AttributeUse {
    readonly declaration: AttributeDeclaration;
    readonly required: boolean;
    readonly fixed: string | null;
    readonly defaultValue: string | null;
}

// ---------------------------------------------------------------------------
// Content model — particles, model groups, wildcards
// ---------------------------------------------------------------------------

export interface Particle {
    readonly minOccurs: number;
    readonly maxOccurs: number | "unbounded";
    readonly term: ParticleTerm;
}

export type ModelGroupKind = "sequence" | "choice" | "all";

export interface ModelGroup {
    readonly kind: ModelGroupKind;
    readonly particles: ReadonlyArray<Particle>;
}

export interface Wildcard {
    readonly kind: "wildcard";
    readonly processContents: "strict" | "lax" | "skip";
}

export type ParticleTerm = ElementDeclaration | ModelGroup | Wildcard;

// ---------------------------------------------------------------------------
// Compiled schema — grammar-per-namespace
// ---------------------------------------------------------------------------

export interface CompiledGrammar {
    readonly namespaceURI: string | null;
    readonly elements: ReadonlyMap<string, ElementDeclaration>;
    readonly types: ReadonlyMap<string, TypeDefinition>;
}

export interface CompiledSchema {
    readonly grammars: ReadonlyMap<string, CompiledGrammar>;
}