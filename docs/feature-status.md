# XSD feature support

## Supported

- ✅ `xs:sequence` content models (order, occurrence counts, `maxOccurs="unbounded"`)
- ✅ `xs:element`, inline and named `xs:complexType` / `xs:simpleType`
- ✅ Built-in type reference resolution (`xsd:string`, `xsd:int`, `xsd:date`, …)
- ✅ Attribute validation (`xs:attribute`, `use="required"`, undeclared-attribute rejection)
- ✅ Namespace support: `targetNamespace`, `elementFormDefault`, qualified/unqualified forms
- ✅ Error taxonomy: `SchemaError` codes, severity, location, listeners

## Compiled but not yet validated

These features are accepted during schema compilation but reported as `UNSUPPORTED_FEATURE` during instance validation:

- ⚠️ `xs:choice` and `xs:all` content models
- ⚠️ `xs:any` wildcards

## Planned

- 🚧 Facet enforcement (`xs:enumeration`, `xs:pattern`, `xs:minLength`, …)
- 🚧 Lexical type validation (`xs:integer`, `xs:date`, …)
- 🚧 `xs:extension` / `xs:restriction` derivation
- 🚧 `xs:key`, `xs:unique`, `xs:keyref`
- 🚧 `xs:import`, `xs:include`, multi-document schemas
- 🚧 `xs:group` and `xs:attributeGroup`