import { CompiledGrammar, ComplexTypeDefinition, QName, SimpleTypeDefinition } from "@lib/types/component-graph";
import { deepFreeze } from "@lib/types/immutable";
import { NAMESPACE_XSD } from "@lib/types/namespaces";

/**
 * The XSD 1.0 built-in datatype grammar: the components every schema can
 * reference via the `xsd:` prefix without declaring them.
 *
 * Scope note (CHK-008): built-ins are registered so QName resolution succeeds,
 * but their lexical/derivation semantics are not validated yet — that is the
 * facet/built-in framework work of later tickets (CHK-010..CHK-014).
 */

function builtinQName(localName: string): QName {
    return { namespaceURI: NAMESPACE_XSD, localName };
}

function builtinSimpleType(localName: string): SimpleTypeDefinition {
    return {
        kind: "simple-type",
        name: builtinQName(localName),
        variety: "atomic",
        itemType: null,
        memberTypes: [],
        facets: [],
    };
}

function builtinAnyType(): ComplexTypeDefinition {
    return {
        kind: "complex-type",
        name: builtinQName("anyType"),
        contentType: "mixed",
        particle: null,
        attributeUses: [],
        simpleType: null,
    };
}

/** Primitive built-in types (XSD 1.0 Part 2 §3.2). */
const PRIMITIVE_TYPES = [
    "string",
    "boolean",
    "decimal",
    "float",
    "double",
    "duration",
    "dateTime",
    "time",
    "date",
    "gYearMonth",
    "gYear",
    "gMonthDay",
    "gDay",
    "gMonth",
    "hexBinary",
    "base64Binary",
    "anyURI",
    "QName",
    "NOTATION",
];

/** Derived built-in types (XSD 1.0 Part 2 §3.3). */
const DERIVED_TYPES = [
    "normalizedString",
    "token",
    "language",
    "NMTOKEN",
    "Name",
    "NCName",
    "ID",
    "IDREF",
    "ENTITY",
    "ENTITIES",
    "IDREFS",
    "NMTOKENS",
    "integer",
    "nonPositiveInteger",
    "negativeInteger",
    "long",
    "int",
    "short",
    "byte",
    "nonNegativeInteger",
    "unsignedLong",
    "unsignedInt",
    "unsignedShort",
    "unsignedByte",
    "positiveInteger",
];

const types = new Map<string, SimpleTypeDefinition | ComplexTypeDefinition>();
for (const name of [...PRIMITIVE_TYPES, ...DERIVED_TYPES, "anySimpleType"]) {
    types.set(name, builtinSimpleType(name));
}
types.set("anyType", builtinAnyType());

/** Singleton frozen grammar holding the XSD namespace's built-in components. */
export const BUILTIN_GRAMMAR: CompiledGrammar = deepFreeze({
    namespaceURI: NAMESPACE_XSD,
    elements: new Map(),
    types,
});