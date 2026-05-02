# Checkr

![CI](https://github.com/jacksierkstra/checkr/actions/workflows/ci.yml/badge.svg)
![NPM Version](https://img.shields.io/npm/v/@jacksierkstra/checkr)
![License](https://img.shields.io/github/license/jacksierkstra/checkr)

Checkr is a **TypeScript-based XML validation library** for validating XML documents against XSD schemas. It is designed to be lightweight, extensible, and dependency-free beyond pure TypeScript/JavaScript.

## Features

- **Pure TypeScript**: No native dependencies, works in Node.js and browsers.
- **Extensible Architecture**: Supports plugin-like extensibility.
- **Comprehensive Validation**: Handles global elements, complex types, attributes, constraints, and more.
- **XSD 1.0 Support**: Covers basic to advanced features like `xs:sequence`, `xs:choice`, `xs:extension`, `xs:restriction`, enumerations, and pattern constraints.
- **Type Inheritance**: Full support for type extension and restriction mechanisms.
- **Performance Optimized**: Includes caching for type resolution and efficient validation pipelines.

## Installation

```sh
npm install @jacksierkstra/checkr
```

or

```sh
yarn add @jacksierkstra/checkr
```

## Usage

```ts
import { Checkr } from "@jacksierkstra/checkr";

const xml = `<root><element>Value</element></root>`;
const xsd = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
              <xs:element name="root">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="element" type="xs:string"/>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
            </xs:schema>`;

const validator = new Checkr();
const result = validator.validate(xml, xsd);

console.log('Valid: ', result.valid);
console.log('Errors: ', result.errors);

// For async call chains, use validateAsync:
// const result = await validator.validateAsync(xml, xsd);
```

## Validation Pipeline

The validation process consists of multiple pipeline stages:

1. **Parsing**: Convert XML and XSD into DOM structures.
2. **Global Validation**: Check elements against global definitions.
3. **Node-Level Validation**:
   - Type validation (xs:string, xs:integer, etc.)
   - Attribute validation (required vs optional, fixed values)
   - Occurrence constraints (minOccurs, maxOccurs)
   - Enumerations and pattern constraints
4. **Choice Validation**: Ensure valid `xs:choice` constraints.
5. **Recursive Validation**: Validate nested elements and structure.

## Supported XSD Features

### Structure and content models
- ✅ `xs:sequence`, `xs:choice`
- ✅ `xs:all` — order-independent children, each allowed at most once; per-child `minOccurs`/`maxOccurs` enforced (XSD 1.0: element-only children, no nesting)
- ✅ `xs:element`, `xs:complexType`, `xs:simpleType`
- ✅ `xs:simpleContent` with extension and restriction
- ✅ `xs:group` and `xs:attributeGroup` — named model groups and attribute groups with `ref` expansion
- ✅ `xs:substitutionGroup` — element substitution including transitive chains
- ✅ `xs:abstract` element declarations
- ✅ `xs:sequence` child-order enforcement
- ✅ Unexpected element and attribute detection

### Type system and inheritance
- ✅ Type inheritance (`xs:extension`, `xs:restriction`) for both simple and complex types
- ✅ `xs:list` — whitespace-separated lists with per-item type validation
- ✅ `xs:union` — simple type unions, both `memberTypes=` and inline `xs:simpleType` member children
- ✅ `block` / `final` / `blockDefault` / `finalDefault` derivation control

### Facets and constraints
- ✅ `xs:enumeration`, `xs:pattern` (multiple patterns treated as OR union)
- ✅ `xs:minLength`, `xs:maxLength`, `xs:length`
- ✅ `xs:totalDigits`, `xs:fractionDigits`
- ✅ `xs:whiteSpace` facet (`preserve`, `replace`, `collapse`)
- ✅ Numeric constraints (`minInclusive`, `maxInclusive`, `minExclusive`, `maxExclusive`)

### Attributes
- ✅ Attribute validation (`xs:attribute`) — required, optional, fixed, default, prohibited (`use="prohibited"`)
- ✅ Inline `xs:simpleType` child of `xs:attribute` with full facet support

### Built-in simple types
All 44 XSD 1.0 built-in types are validated — 19 primitives (`xs:string`, `xs:boolean`, `xs:decimal`, `xs:float`, `xs:double`, `xs:dateTime`, `xs:date`, `xs:time`, `xs:duration`, `xs:gYear`, `xs:gYearMonth`, `xs:gMonth`, `xs:gMonthDay`, `xs:gDay`, `xs:hexBinary`, `xs:base64Binary`, `xs:anyURI`, `xs:QName`, `xs:NOTATION`) plus 25 derived integer, string, and token types.

### Element-level features
- ✅ `xs:nillable` elements with `xsi:nil` support
- ✅ Element `default` and `fixed` value constraints
- ✅ `xs:key`, `xs:unique`, `xs:keyref` — identity constraint validation
- ✅ `xs:ID` uniqueness and `xs:IDREF` referential integrity
- ✅ Namespace support and resolution (`elementFormDefault`, `attributeFormDefault`, `form`)

### Wildcards and notation
- ✅ `xs:any` and `xs:anyAttribute` wildcards with `processContents` enforcement (strict / lax / skip)
- ✅ `xs:any` / `xs:anyAttribute` `namespace` constraint (`##any`, `##local`, `##other`, specific URI)
- ✅ `xs:notation` declaration parsing and `xs:NOTATION` value validation

### Annotation elements
`xs:annotation`, `xs:documentation`, and `xs:appinfo` are silently ignored — they are purely informational and carry no validation semantics.

### Out of scope
- 🚧 **`xsi:type` runtime type override** — when an XML element carries `xsi:type="T"`, the validator does not currently switch to the named type. See [feat-xsi-type](docs/backlog/feat-xsi-type.md).
- 🚧 **`xs:import`, `xs:include`, `xs:redefine`** — single-document schemas only; multi-document composition is not supported. See [ADR-009](docs/adr/ADR-009-deferred-xsd-features.md).

## Running Tests

To run the test suite:

```sh
npm test
```

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## License

This project is licensed under the **MIT License**.

---

> Maintained by [@jacksierkstra](https://github.com/jacksierkstra)

