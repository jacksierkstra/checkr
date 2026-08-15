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

/** The three XSD whitespace-normalization modes (XSD 1.0 Part 2 §4.3.6). */
export type WhiteSpaceValue = "preserve" | "replace" | "collapse";

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
    /**
     * The resolved item type of a `list`-variety type (from the `itemType`
     * attribute or an inline anonymous `xs:simpleType`). Null for atomic and
     * union varieties. For a list derived by restriction, inherited from the
     * base list by the compiler (CHK-016).
     */
    readonly itemTypeDef: SimpleTypeDefinition | null;
    /**
     * The resolved member types of a `union`-variety type (from the
     * `memberTypes` attribute followed by inline anonymous `xs:simpleType`
     * children, in document order). Empty for atomic and list varieties. For
     * a union derived by restriction, inherited from the base union (CHK-016).
     */
    readonly memberTypeDefs: ReadonlyArray<SimpleTypeDefinition>;
    /** This type's own facets, as declared on its restriction (CHK-010). */
    readonly facets: ReadonlyArray<Facet>;
    /**
     * The resolved base type of a restriction, or the item type of a list
     * (set at compile time by pass-2 resolution). Null for primitives and
     * unions. Facet inheritance walks this chain (CHK-010).
     */
    readonly baseType: SimpleTypeDefinition | null;
    /**
     * The effective whitespace normalization after facet inheritance down the
     * restriction chain (fixed for built-ins). Applied before facet checks.
     */
    readonly whiteSpace: WhiteSpaceValue;
    /**
     * The effective facets after inheritance down the restriction chain:
     * own facets win over inherited ones; patterns accumulate; the effective
     * enumeration is the own one when present, else the inherited one.
     */
    readonly effectiveFacets: ReadonlyArray<Facet>;
}

export type ContentType = "element-only" | "simple" | "mixed" | "empty";

/** How a complex type derives from its base (XSD 1.0 §3.4.2/§3.4.4/§3.4.6, CHK-020). */
export type DerivationMethod = "extension" | "restriction";

export interface ComplexTypeDefinition {
    readonly kind: "complex-type";
    readonly name: QName | null;
    readonly contentType: ContentType;
    readonly particle: Particle | null;
    readonly attributeUses: ReadonlyArray<AttributeUse>;
    /** When `contentType` is `"simple"`, the underlying simple type. */
    readonly simpleType: SimpleTypeDefinition | null;
    /**
     * The resolved base complex type definition for types derived via
     * `<xs:complexContent>` or `<xs:simpleContent>` extension/restriction.
     * Null for types that are not derived from a complex base (CHK-020).
     * For simpleContent restriction against a pure simple-type base, the
     * base lives on the anonymous `simpleType`'s `baseType` chain instead.
     */
    readonly baseType: ComplexTypeDefinition | null;
    /**
     * How this complex type derives from its `baseType` (`"extension"`
     * or `"restriction"`), or null when the type is not derived (CHK-020).
     */
    readonly derivationMethod: DerivationMethod | null;
    /**
     * The attribute wildcard from `<xs:anyAttribute>` (CHK-021). The compiler
     * computes the "complete wildcard" (XSD 1.0 §3.4.3): the local wildcard
     * intersected with the referenced attribute groups' wildcards, then unions
     * it with the base type's wildcard for extension derivations (§3.4.2).
     * Null when the type declares (and inherits) no attribute wildcard.
     */
    readonly attributeWildcard: Wildcard | null;
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
    /**
     * For a local element declaration produced by `<xs:element ref="…">`,
     * the QName of the referenced global element declaration. Resolved at
     * compile time (pass 2) to point the particle's term to the global
     * declaration. Null for non-ref declarations (CHK-017).
     */
    readonly ref: QName | null;
}

export interface AttributeDeclaration {
    readonly kind: "attribute";
    readonly name: QName;
    readonly typeRef: QName | null;
    readonly type: SimpleTypeDefinition | null;
    /**
     * For an attribute declaration produced by `<xs:attribute ref="…">`,
     * the QName of the referenced global attribute declaration. Resolved at
     * compile time (pass 2). Null for non-ref declarations (CHK-017).
     */
    readonly ref: QName | null;
}

export interface AttributeUse {
    readonly declaration: AttributeDeclaration;
    readonly required: boolean;
    readonly fixed: string | null;
    readonly defaultValue: string | null;
    /**
     * For a use produced by `<xs:attributeGroup ref="…">`, the QName of the
     * referenced attribute group definition. Resolved at compile time (pass 2)
     * by splicing the referenced group's uses into this position. Null for
     * non-ref uses (CHK-019).
     */
    readonly attributeGroupRef: QName | null;
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
    /**
     * For a group produced by `<xs:group ref="…">`, the QName of the
     * referenced model group definition. Resolved at compile time (pass 2)
     * by replacing this group's particles (and kind) with the referenced
     * definition's content. Null for non-ref groups (CHK-019).
     */
    readonly ref: QName | null;
}

/**
 * The {namespace constraint} of a wildcard (XSD 1.0 §3.10.1), normalized at
 * compile time so it carries no reference to the schema's target namespace:
 * - `"any"` — `##any` (the default): every namespace is allowed.
 * - `"other"` — `##other`: every namespace except the schema's target
 *   namespace. Per §3.10.4 rule 2.3, the absent (no) namespace never matches
 *   a `##other` constraint.
 * - `"uris"` — an explicit whitespace-separated list; `##targetNamespace`
 *   was resolved to the target URI and `##local` to the `""` sentinel (the
 *   absent namespace, matching `namespaceKey`). An empty set matches nothing.
 */
export type NamespaceConstraint =
    | { readonly kind: "any" }
    | { readonly kind: "other"; readonly target: string | null }
    | { readonly kind: "uris"; readonly uris: ReadonlySet<string> };

export interface Wildcard {
    readonly kind: "wildcard";
    readonly processContents: "strict" | "lax" | "skip";
    /** The parsed `namespace` attribute (defaults to `##any`, CHK-021). */
    readonly namespaceConstraint: NamespaceConstraint;
}

export type ParticleTerm = ElementDeclaration | ModelGroup | Wildcard;

// ---------------------------------------------------------------------------
// Compiled schema — grammar-per-namespace
// ---------------------------------------------------------------------------

export interface ModelGroupDefinition {
    readonly kind: "model-group-definition";
    readonly name: QName;
    /**
     * The particle whose term is the definition's model group. Carries the
     * top compositor's minOccurs/maxOccurs. When the definition is referenced
     * via `<xs:group ref="…">`, the ref particle copies this particle's
     * content (CHK-019).
     */
    readonly particle: Particle;
}

export interface AttributeGroupDefinition {
    readonly kind: "attribute-group-definition";
    readonly name: QName;
    readonly attributeUses: ReadonlyArray<AttributeUse>;
    /** The attribute wildcard from `<xs:anyAttribute>` (CHK-021). */
    readonly attributeWildcard: Wildcard | null;
}

export interface CompiledGrammar {
    readonly namespaceURI: string | null;
    readonly elements: ReadonlyMap<string, ElementDeclaration>;
    readonly attributes: ReadonlyMap<string, AttributeDeclaration>;
    readonly types: ReadonlyMap<string, TypeDefinition>;
    readonly modelGroups: ReadonlyMap<string, ModelGroupDefinition>;
    readonly attributeGroups: ReadonlyMap<string, AttributeGroupDefinition>;
}

export interface CompiledSchema {
    readonly grammars: ReadonlyMap<string, CompiledGrammar>;
}