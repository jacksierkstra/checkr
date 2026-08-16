import {
    CompiledGrammar,
    ComplexTypeDefinition,
    Facet,
    QName,
    SimpleTypeDefinition,
    WhiteSpaceValue,
} from "@lib/types/component-graph";
import { deepFreeze } from "@lib/types/immutable";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
import { computeEffectiveFacets } from "@lib/xsd/facets";

/**
 * The XSD 1.0 built-in datatype grammar: the components every schema can
 * reference via the `xsd:` prefix without declaring them.
 *
 * Scope note (CHK-008): built-ins are registered so QName resolution succeeds,
 * but their lexical/derivation semantics are not validated yet — that is the
 * facet/built-in framework work of later tickets (CHK-010..CHK-014).
 *
 * CHK-010: built-ins now carry whiteSpace values and base-type links for the
 * string and numeric families, so facet inheritance works for user-defined
 * restrictions. Lexical-space validation (regex patterns for Name, NCName,
 * etc.) remains CHK-011..CHK-014.
 */

function builtinQName(localName: string): QName {
    return { namespaceURI: NAMESPACE_XSD, localName };
}

// ---------------------------------------------------------------------------
// WhiteSpace values per built-in type (XSD 1.0 Part 2 §4.3.6)
// ---------------------------------------------------------------------------
// string: preserve
// All other primitive types: collapse
// normalizedString: replace (derived from string)
// token: collapse (derived from normalizedString)
// All types derived from token: collapse
// All types derived from decimal: collapse

const WS_PRESERVE: WhiteSpaceValue = "preserve";
const WS_REPLACE: WhiteSpaceValue = "replace";
const WS_COLLAPSE: WhiteSpaceValue = "collapse";

// ---------------------------------------------------------------------------
// Built-in type definitions
// ---------------------------------------------------------------------------

interface BuiltinDef {
    localName: string;
    whiteSpace: WhiteSpaceValue;
    /** Base type localName, or null for primitives. */
    baseName: string | null;
    /** Fixed facets baked into the type definition (e.g. fractionDigits=0 on integer). */
    facets?: Facet[];
}

const BUILTIN_DEFS: BuiltinDef[] = [
    // Primitive types (baseName = null)
    { localName: "anySimpleType", whiteSpace: WS_PRESERVE, baseName: null },
    { localName: "string", whiteSpace: WS_PRESERVE, baseName: null },
    { localName: "boolean", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "decimal", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "float", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "double", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "duration", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "dateTime", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "time", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "date", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "gYearMonth", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "gYear", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "gMonthDay", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "gDay", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "gMonth", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "hexBinary", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "base64Binary", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "anyURI", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "QName", whiteSpace: WS_COLLAPSE, baseName: null },
    { localName: "NOTATION", whiteSpace: WS_COLLAPSE, baseName: null },

    // String family (derived)
    { localName: "normalizedString", whiteSpace: WS_REPLACE, baseName: "string" },
    { localName: "token", whiteSpace: WS_COLLAPSE, baseName: "normalizedString" },
    { localName: "language", whiteSpace: WS_COLLAPSE, baseName: "token" },
    { localName: "NMTOKEN", whiteSpace: WS_COLLAPSE, baseName: "token" },
    { localName: "NMTOKENS", whiteSpace: WS_COLLAPSE, baseName: "NMTOKEN", facets: [{ kind: "whiteSpace", value: "collapse" }] },
    { localName: "Name", whiteSpace: WS_COLLAPSE, baseName: "token" },
    { localName: "NCName", whiteSpace: WS_COLLAPSE, baseName: "Name" },
    { localName: "ID", whiteSpace: WS_COLLAPSE, baseName: "NCName" },
    { localName: "IDREF", whiteSpace: WS_COLLAPSE, baseName: "NCName" },
    { localName: "IDREFS", whiteSpace: WS_COLLAPSE, baseName: "IDREF", facets: [{ kind: "whiteSpace", value: "collapse" }] },
    { localName: "ENTITY", whiteSpace: WS_COLLAPSE, baseName: "NCName" },
    { localName: "ENTITIES", whiteSpace: WS_COLLAPSE, baseName: "ENTITY", facets: [{ kind: "whiteSpace", value: "collapse" }] },

    // Numeric family (derived from decimal)
    { localName: "integer", whiteSpace: WS_COLLAPSE, baseName: "decimal", facets: [{ kind: "fractionDigits", value: "0" }] },
    { localName: "nonPositiveInteger", whiteSpace: WS_COLLAPSE, baseName: "integer", facets: [{ kind: "maxInclusive", value: "0" }] },
    { localName: "negativeInteger", whiteSpace: WS_COLLAPSE, baseName: "nonPositiveInteger", facets: [{ kind: "maxExclusive", value: "0" }] },
    { localName: "long", whiteSpace: WS_COLLAPSE, baseName: "integer", facets: [{ kind: "minInclusive", value: "-9223372036854775808" }, { kind: "maxInclusive", value: "9223372036854775807" }] },
    { localName: "int", whiteSpace: WS_COLLAPSE, baseName: "long", facets: [{ kind: "minInclusive", value: "-2147483648" }, { kind: "maxInclusive", value: "2147483647" }] },
    { localName: "short", whiteSpace: WS_COLLAPSE, baseName: "int", facets: [{ kind: "minInclusive", value: "-32768" }, { kind: "maxInclusive", value: "32767" }] },
    { localName: "byte", whiteSpace: WS_COLLAPSE, baseName: "short", facets: [{ kind: "minInclusive", value: "-128" }, { kind: "maxInclusive", value: "127" }] },
    { localName: "nonNegativeInteger", whiteSpace: WS_COLLAPSE, baseName: "integer", facets: [{ kind: "minInclusive", value: "0" }] },
    { localName: "unsignedLong", whiteSpace: WS_COLLAPSE, baseName: "nonNegativeInteger", facets: [{ kind: "minInclusive", value: "0" }, { kind: "maxInclusive", value: "18446744073709551615" }] },
    { localName: "unsignedInt", whiteSpace: WS_COLLAPSE, baseName: "unsignedLong", facets: [{ kind: "minInclusive", value: "0" }, { kind: "maxInclusive", value: "4294967295" }] },
    { localName: "unsignedShort", whiteSpace: WS_COLLAPSE, baseName: "unsignedInt", facets: [{ kind: "minInclusive", value: "0" }, { kind: "maxInclusive", value: "65535" }] },
    { localName: "unsignedByte", whiteSpace: WS_COLLAPSE, baseName: "unsignedShort", facets: [{ kind: "minInclusive", value: "0" }, { kind: "maxInclusive", value: "255" }] },
    { localName: "positiveInteger", whiteSpace: WS_COLLAPSE, baseName: "nonNegativeInteger", facets: [{ kind: "minExclusive", value: "0" }] },
];

// Build the types map in two passes so we can wire baseType references.
const byName = new Map<string, SimpleTypeDefinition>();

// Pass 1: create all definitions with baseType = null, whiteSpace set, effectiveFacets pre-assigned.
for (const def of BUILTIN_DEFS) {
    const st: SimpleTypeDefinition = {
        kind: "simple-type",
        name: builtinQName(def.localName),
        variety: "atomic",
        itemType: def.baseName ? builtinQName(def.baseName) : null,
        memberTypes: [],
        itemTypeDef: null,
        memberTypeDefs: [],
        facets: def.facets ?? [],
        baseType: null,
        whiteSpace: def.whiteSpace,
        effectiveFacets: def.facets ?? [],
        // The built-in datatypes do not block user derivations (restriction,
        // list, and union of built-ins are all legal; CHK-023).
        final: "",
        annotations: [],
    };
    byName.set(def.localName, st);
}

// Pass 2: wire baseType references and compute effectiveFacets through the chain.
// The iteration order is topological (bases before derivations) so each type's
// base already has its effectiveFacets computed when visited.
for (const def of BUILTIN_DEFS) {
    const st = byName.get(def.localName)!;
    if (def.baseName) {
        const base = byName.get(def.baseName);
        if (base) {
            // Mutation before freeze: wire baseType
            (st as { baseType: SimpleTypeDefinition | null }).baseType = base;
            // Compute effective facets through the restriction chain.
            // computeEffectiveFacets filters whiteSpace facets; those are
            // tracked separately via the whiteSpace field.
            const eff = computeEffectiveFacets(st.facets, base);
            (st as { effectiveFacets: ReadonlyArray<Facet> }).effectiveFacets = eff;
        }
    }
}

function builtinAnyType(): ComplexTypeDefinition {
    return {
        kind: "complex-type",
        name: builtinQName("anyType"),
        contentType: "mixed",
        // Per errata E1-22 (R-117), the ur-type's {particle} is a ##any
        // wildcard with processContents=lax, so an element typed anyType
        // (or with no declared type) accepts any element content and any
        // attributes, validating them lazily against the schema (CHK-027).
        particle: {
            minOccurs: 0,
            maxOccurs: "unbounded",
            term: {
                kind: "wildcard",
                processContents: "lax",
                namespaceConstraint: { kind: "any" },
            },
        },
        attributeUses: [],
        simpleType: null,
        baseType: null,
        derivationMethod: null,
        // The ur-type's {attribute wildcard} is likewise ##any with lax
        // processing (XSD 1.0 §3.4.2, errata E1-22).
        attributeWildcard: {
            kind: "wildcard",
            processContents: "lax",
            namespaceConstraint: { kind: "any" },
        },
        isAbstract: false,
        final: "",
        annotations: [],
    };
}

// Add anySimpleType and all built-in types to the map
const types = new Map<string, SimpleTypeDefinition | ComplexTypeDefinition>();
for (const [name, st] of byName) {
    types.set(name, st);
}
types.set("anyType", builtinAnyType());

/** Singleton frozen grammar holding the XSD namespace's built-in components. */
export const BUILTIN_GRAMMAR: CompiledGrammar = deepFreeze({
    namespaceURI: NAMESPACE_XSD,
    elements: new Map(),
    attributes: new Map(),
    modelGroups: new Map(),
    attributeGroups: new Map(),
    identityConstraints: new Map(),
    substitutionGroups: new Map(),
    notations: new Map(),
    types,
});

/** Exported for compiler reference-resolution pass to look up bases. */
export function lookupBuiltinType(localName: string): SimpleTypeDefinition | null {
    const t = byName.get(localName);
    return t ?? null;
}