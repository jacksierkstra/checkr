# Checkr

![CI](https://github.com/jacksierkstra/checkr/actions/workflows/ci.yml/badge.svg)
![NPM Version](https://img.shields.io/npm/v/@jacksierkstra/checkr)
![License](https://img.shields.io/github/license/jacksierkstra/checkr)

Checkr is a **TypeScript-based XML validation library** for validating XML documents against XSD schemas. It is designed to be lightweight, extensible, and dependency-free beyond pure TypeScript/JavaScript.

## Features

- **Two-phase API**: compile a schema once into an immutable, reusable `CompiledSchema`, then validate any number of instances against it.
- **Typed component graph**: compiled schemas model the XSD 1.0 component model (element declarations, complex/simple type definitions, particles, model groups, attribute uses) as typed, deeply-frozen objects.
- **Eager, multi-pass resolution**: QName references (built-in and user-defined types) resolve at compile time; a schema that does not resolve is a compile error, never a confusing validation error.
- **Structured errors**: every problem is a `SchemaError` with a severity, machine-readable code, human-readable message, source location, and phase (`schema-compilation` / `instance-validation`), delivered via optional listeners.
- **Pure TypeScript**: no native dependencies, works in Node.js and browsers.

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
import { compileSchema, validate } from "@jacksierkstra/checkr";

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

// Phase 1 — compile the schema once. Throws SchemaCompilationError for
// malformed or non-resolving schemas.
const schema = compileSchema(xsd);

// Phase 2 — validate any number of instances against the compiled schema.
const result = validate(xml, schema);

console.log('Valid: ', result.valid);
for (const error of result.errors) {
    console.log(`[${error.code}] ${error.message} (line ${error.location.line})`);
}
```

Receive a structured report of *all* problems, not just one: validation continues after non-fatal errors and returns every `SchemaError`. To stream errors as they are found, pass a listener:

```ts
const result = validate(xml, schema, {
    listener: (error) => console.error(error.code, error.message),
});
```

## Architecture

Validation is split into two phases, mirroring the XSD 1.0 spec Part 1's own structure and the pattern used by Xerces-J and libxml2:

1. **Schema compilation** (`compileSchema`): parse the schema document → register every global component in its target-namespace grammar → resolve QName references eagerly (multi-pass) → validate the schema → produce a deeply frozen, immutable `CompiledSchema` that is safe to reuse and share.
2. **Instance validation** (`validate`): walk the XML tree depth-first against the compiled schema — content models (sequence particles, `minOccurs`/`maxOccurs`), attribute uses (required, undeclared), and namespace resolution (qualified vs unqualified local elements, `elementFormDefault`).

## Supported XSD Features

- ✅ `xs:sequence` content models (order, occurrence counts, `maxOccurs="unbounded"`)
- ✅ `xs:element`, inline and named `xs:complexType` / `xs:simpleType`
- ✅ Built-in type reference resolution (`xsd:string`, `xsd:int`, `xsd:date`, …)
- ✅ Attribute validation (`xs:attribute`, `use="required"`, undeclared-attribute rejection)
- ✅ Namespace support: `targetNamespace`, `elementFormDefault`, qualified/unqualified forms
- ✅ Error taxonomy: `SchemaError` codes, severity, location, listeners
- ⚠️ **Compiled but not yet validated** (validation reports `UNSUPPORTED_FEATURE`):
  - `xs:choice` and `xs:all` content models
  - `xs:any` wildcards
- 🚧 **Planned**:
  - Facet enforcement (`xs:enumeration`, `xs:pattern`, `xs:minLength`, …)
  - Lexical type validation (`xs:integer`, `xs:date`, …)
  - `xs:extension` / `xs:restriction` derivation
  - `xs:key`, `xs:unique`, `xs:keyref`
  - `xs:import`, `xs:include`, multi-document schemas
  - `xs:group` and `xs:attributeGroup`

## Running Tests

To run the test suite:

```sh
yarn test
```

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## License

This project is licensed under the **MIT License**.

---

> Maintained by [@jacksierkstra](https://github.com/jacksierkstra)