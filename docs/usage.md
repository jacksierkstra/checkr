# Usage — `@jacksierkstra/checkr`

## Two-phase API

Validation is split into two phases:

1. **Schema compilation** — parse an XSD schema document once into an immutable, reusable `CompiledSchema`.
2. **Instance validation** — validate any number of XML documents against the compiled schema.

## Basic example

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

// Phase 1 — compile the schema once.
const schema = compileSchema(xsd);

// Phase 2 — validate any number of instances against the compiled schema.
const result = validate(xml, schema);

console.log('Valid: ', result.valid);
for (const error of result.errors) {
    console.log(`[${error.code}] ${error.message} (line ${error.location.line})`);
}
```

## Error streaming

Pass a `listener` option to receive errors as they are found. Validation continues after non-fatal errors and returns every `SchemaError` in the result:

```ts
const result = validate(xml, schema, {
    listener: (error) => console.error(error.code, error.message),
});
```

## API reference

### `compileSchema(xsd: string, options?: CompileOptions): CompiledSchema`

Parses an XSD schema document and returns a deeply frozen, immutable `CompiledSchema`.

| Option | Type | Default | Description |
|---|---|---|---|
| `listener` | `SchemaErrorListener` | `undefined` | Called for each error found during compilation |
| `resolve` | `(location: string) => string \| null` | `undefined` | Resolves a `schemaLocation` URI (from `xs:include`/`xs:import`/`xs:redefine`) to the referenced schema document; required for multi-document schemas |

Throws `SchemaCompilationError` if the schema is malformed or contains unresolvable QName references.

### `validate(xml: string, schema: CompiledSchema, options?: ValidateOptions): SchemaValidationResult`

Validates an XML document against a compiled schema.

| Option | Type | Default | Description |
|---|---|---|---|
| `listener` | `SchemaErrorListener` | `undefined` | Called for each error found during validation |

Returns `SchemaValidationResult`:

```ts
interface SchemaValidationResult {
    valid: boolean;
    errors: SchemaError[];
}
```

### Error types

| Type | Description |
|---|---|
| `SchemaError` | A single error with a `code`, `message`, `severity`, `phase`, and `location` |
| `SchemaCompilationError` | Thrown at compile time for invalid or non-resolving schemas; carries the full `errors` list |
| `SchemaErrorCode` | Machine-readable error code string |
| `SchemaSeverity` | `'warning'` / `'error'` / `'fatal'` |
| `SchemaPhase` | `'schema-compilation'` or `'instance-validation'` |
| `SchemaLocation` | `{ line: number, column: number, systemId?: string }` |
| `SchemaErrorListener` | `(error: SchemaError) => void` |

### Component graph types

The compiled schema exposes the full XSD 1.0 component model as typed, deeply-frozen objects:

| Type | Description |
|---|---|
| `CompiledSchema` | Top-level schema object, holds a `CompiledGrammar` per target namespace |
| `CompiledGrammar` | All global components for one target namespace |
| `ElementDeclaration` | Global or local element declaration |
| `ComplexTypeDefinition` | Complex type with content type, particle tree, attribute uses |
| `SimpleTypeDefinition` | Simple type with variety (atomic/list/union) and facets |
| `ModelGroup` | `sequence`, `choice`, or `all` compositor |
| `Particle` | Wraps a term with `minOccurs`/`maxOccurs` |
| `AttributeDeclaration` / `AttributeUse` | Attribute declaration and its use in a type |
| `Wildcard` | `xs:any` / `xs:anyAttribute` |
| `Facet` | Constraining facet (enumeration, pattern, length, etc.) |
| `QName` | `{ namespaceURI }localName` qualified name |
| `NamespaceConstraint` | Namespace constraint for wildcards |
| `ContentType` | `'element-only'` / `'simple'` / `'mixed'` / `'empty'` |
