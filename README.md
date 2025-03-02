# Checkr

![CI](https://github.com/jacksierkstra/checkr/actions/workflows/ci.yml/badge.svg)
![NPM Version](https://img.shields.io/npm/v/@jacksierkstra/checkr)
![License](https://img.shields.io/github/license/jacksierkstra/checkr)

Checkr is a **TypeScript-based XML validation library** for validating XML documents against XSD schemas. It is designed to be lightweight, extensible, and dependency-free beyond pure TypeScript/JavaScript.

## Features

- **Pure TypeScript**: No native dependencies, works in Node.js and browsers.
- **Extensible Architecture**: Supports plugin-like extensibility.
- **Comprehensive Validation**: Handles global elements, complex types, attributes, constraints, and more.
- **XSD 1.0 Support**: Covers basic to intermediate features like `xs:sequence`, `xs:choice`, enumerations, and type restrictions.

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
const validation = validator.validate(xml, xsd);

validation.then(result => {
    console.log('Valid: ', result.valid);
    console.log('Errors: ', result.errors);
});
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

- ✅ `xs:sequence`, `xs:choice`
- ✅ `xs:element`, `xs:complexType`
- ✅ `xs:enumeration`, `xs:pattern`
- ✅ `xs:minLength`, `xs:maxLength`
- ✅ Attribute validation (`xs:attribute`)
- 🚧 **Planned**:
  - `xs:all`
  - `xs:extension` and `xs:restriction`
  - `xs:key`, `xs:unique`, `xs:keyref`
  - Namespaced imports (`xs:import`, `xs:include`)

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

