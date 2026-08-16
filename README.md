# Checkr

![CI](https://github.com/jacksierkstra/checkr/actions/workflows/ci.yml/badge.svg)
![NPM Version](https://img.shields.io/npm/v/@jacksierkstra/checkr)
![License](https://img.shields.io/github/license/jacksierkstra/checkr)

A TypeScript library for validating XML documents against XSD schemas.

## Install

```sh
npm install @jacksierkstra/checkr
```

or

```sh
yarn add @jacksierkstra/checkr
```

## Quick start

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

// Phase 1 — compile the schema once, then reuse it.
const schema = compileSchema(xsd);

// Phase 2 — validate any number of instances against the compiled schema.
const result = validate(xml, schema);
console.log(result.valid, result.errors);
```

## Documentation

- [Usage guide](docs/usage.md) — full examples, options, and API reference
- [XSD feature support](docs/feature-status.md) — supported, unsupported, and planned features
- [Architecture](docs/adr/architecture-component-model.md) — design decisions and component model
- [Contributing](docs/CONTRIBUTING.md)

## License

MIT
