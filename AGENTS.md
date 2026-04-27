# Checkr – Agent Instructions

## Commands

```sh
npm test                          # run full test suite (with coverage)
npm run build                     # compile with tspc → dist/
npm run clean                     # delete dist/

# Run a single test file
npx jest src/lib/xsd/parser.test.ts

# Run tests matching a name pattern
npx jest --testNamePattern="validates attributes"
```

> Build uses `tspc` (ts-patch) instead of plain `tsc` because of the `typescript-transform-paths` plugin that rewrites `@lib/*` path aliases in emitted `.js` and `.d.ts` files.

## Architecture

`Checkr` (public API) wires three collaborators together:

```
Checkr
  ├── XMLParserImpl          — parses raw XML strings into a DOM (via @xmldom/xmldom)
  ├── XSDPipelineParserImpl  — parses XSD strings into XSDSchema
  └── ValidatorImpl          — runs the schema against the XML DOM
```

### XSD Parsing pipeline (`src/lib/xsd/`)

`XSDPipelineParserImpl` processes each top-level `xs:element` and `xs:complexType` DOM node through a chain of `PipelineStep<Element, Partial<XSDElement>>` steps:

| Step | What it extracts |
|---|---|
| `ParseRootElementStep` | name, type, minOccurs/maxOccurs |
| `ParseEnumerationStep` | `xs:enumeration` values |
| `ParseAttributesStep` | `xs:attribute` definitions |
| `ParseNestedElementsStep` | sequence / choice / all children |
| `ParseRestrictionsStep` | `xs:restriction` constraints |
| `ParseExtensionStep` | `xs:extension` base + merged content |

Each step returns a `Partial<XSDElement>`. The `ElementAssembler` merges the array of partials into a single `XSDElement`. After assembly, `ModularTypeReferenceResolver` walks the element tree and resolves `type="..."` references against the global types map.

### Resolver subsystem (`src/lib/xsd/resolvers/modules/`)

Each module implements one interface from `interfaces.ts`:

- `TypeRegistry` → `ITypeRegistry` – looks up global types by name/namespace  
- `ResolutionCache` → `IResolutionCache` – memoises resolved types  
- `TypeResolver` → `ITypeResolver` – resolves a plain `type` reference  
- `TypeExtender` → `ITypeExtender` – merges `xs:extension` base properties  
- `TypeRestrictor` → `ITypeRestrictor` – applies `xs:restriction` constraints  
- `PropertyMerger` → `IPropertyMerger` – merges attribute/child collections  
- `ElementResolver` → `IElementResolver` – orchestrates the above for one element  

### Validation pipeline (`src/lib/validator/`)

`ValidatorImpl` holds two pipelines built from function-based steps:

- **NodeValidationPipeline** – per XML node: `validateAbstract` → `validateType` → `validateAttributes` → `validateConstraints` → `validateRequiredChildren`  
- **GlobalValidationPipeline** – per element group: `validateOccurrence`

Validation is recursive: after running both pipelines on a node, `ValidatorImpl.validateNode` recurses into child elements that are present in the document.

## Key Conventions

### Path alias
`@lib/*` maps to `src/lib/*`. Use it for all cross-module imports. The alias is configured in both `tsconfig.json` and `jest.config.ts` (`moduleNameMapper`).

### Test placement
Test files live next to the source file they test: `foo.ts` / `foo.test.ts`. Test environment is `jest-environment-jsdom`.

### Type definitions
All shared interfaces and types live in `src/lib/types/` (`xsd.ts`, `xml.ts`, `validation.ts`). Don't scatter type definitions into implementation files.

### Pipeline steps return partials
XSD pipeline steps return `Partial<XSDElement>`, not a full element. Merging is done centrally by `ElementAssembler`. Each step should only populate the fields it is responsible for.

### Interface-first resolver modules
Every resolver module in `src/lib/xsd/resolvers/modules/` implements a named interface from `interfaces.ts`. New resolver modules should follow this pattern.

### DOM handling
`@xmldom/xmldom` is the only runtime dependency. When querying XSD nodes, always try `getElementsByTagNameNS(XSD_NAMESPACE, localName)` first and fall back to `getElementsByTagName("xs:localName")` for environments where namespace resolution may differ (see `ParseExtensionStep` for the established pattern).
