# Checkr – Agent Instructions

Checkr is a TypeScript library that validates XML documents against XSD schemas. It targets both Node.js and browser environments and has `@xmldom/xmldom` as its only runtime dependency.

The public API returns `ValidationResult: { valid: boolean; errors: string[] }`. This is the only output contract — errors are always strings, never thrown exceptions.

## Commands

```sh
npm test                                         # full test suite + coverage
npm run build                                    # compile → dist/ (use tspc, not tsc)
npm run clean                                    # delete dist/

npx jest src/lib/xsd/parser.test.ts             # single test file
npx jest --testNamePattern="validates type"     # tests matching a name pattern
```

## Out-of-scope XSD features — do not implement

The following XSD features are explicitly deferred. Do not implement them unless asked:

- `xs:all`
- `xs:key`, `xs:unique`, `xs:keyref`
- `xs:import`, `xs:include`
- `xs:group`, `xs:attributeGroup`

Attempting partial support for any of these will silently produce wrong validation results.

## Architecture overview

The library is split into three responsibilities wired together in `Checkr`:

1. **`XMLParserImpl`** — parses raw XML strings into a `@xmldom/xmldom` DOM  
2. **`XSDPipelineParserImpl`** — parses XSD strings into an `XSDSchema` object tree  
3. **`ValidatorImpl`** — walks the XML DOM against the parsed schema and collects errors

Do not merge these responsibilities.

### Error handling contract

`ValidatorImpl.validate` **never throws**. All exceptions — including XML/XSD parse failures — are caught and returned as `{ valid: false, errors: ["Validation error: ..."] }`.

Validation steps and resolvers must follow the same rule:
- Return `string[]` (empty = no errors). Never throw.
- If a step encounters an unexpected node type, a null reference, or a malformed attribute it cannot handle: return `[]` and skip it silently, or return a descriptive error string. Do not invent a separate error handling strategy.

Do not add retry logic or Promise rejection handling around the public `validate` method.

### Test environment

The test environment is `jest-environment-jsdom`. Do not change it. The library targets both Node.js and browsers, and tests must exercise the browser DOM path that `@xmldom/xmldom` exposes.

## How to add support for a new XSD feature

This is the most common change to this codebase. Follow these steps in order:

**1. Add fields to the schema types** (`src/lib/types/xsd.ts`)  
Add any new properties to `XSDElement`, `XSDRestriction`, `XSDExtension`, or introduce a new interface if needed. This is the source of truth for what the library understands.

**2. Add an XSD parsing step** (`src/lib/xsd/pipeline/steps/`)  
Create a new class implementing `PipelineStep<Element, Partial<XSDElement>>`. The `execute` method receives a raw DOM `Element` and must return **only the fields it is responsible for** as a `Partial<XSDElement>`. Do not return a full object. Register it in `XSDPipelineParserImpl` by calling `.addStep(new YourStep())`.

**3. Add a validation step if needed** (`src/lib/validator/pipeline/steps/`)  
If the new feature requires runtime validation, create a function matching `NodeValidationStep = (node: Element, schema: XSDElement) => string[]` or `GlobalValidationStep = (nodes: Element[], schema: XSDElement) => string[]`. Register node-level steps in `ValidatorImpl`'s `nodePipeline`, occurrence-style steps in `globalPipeline`.

**4. Update the resolver if the feature involves type references**  
Use this rule to decide:
- If the feature is a **new form of type inheritance** (e.g., `xs:union`): add a new module + interface pair in `src/lib/xsd/resolvers/modules/`, following the pattern in `interfaces.ts`.
- If the feature **extends existing inheritance behaviour** (e.g., a new property on `xs:extension`): update the relevant existing module behind its existing interface.

**5. Write a co-located test file**  
Place `yourFeature.test.ts` next to `yourFeature.ts`. Use inline XML/XSD strings — no fixture files. Tests must be self-contained and avoid file I/O so the test suite runs identically in Node.js and browser environments.

## Critical conventions

### DOM querying — always use the dual-lookup pattern

XSD documents may or may not declare the `xs:` namespace correctly depending on the source. Always query with namespace first, then fall back:

```ts
const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

let el = parent.getElementsByTagNameNS(XSD_NAMESPACE, "sequence")[0] as Element;
if (!el) {
    el = parent.getElementsByTagName("xs:sequence")[0] as Element;
}
```

Skipping the fallback causes silent failures on valid XSD documents. See `ParseExtensionStep` for the canonical example.

### Path alias

Use `@lib/*` for all imports within `src/`. It maps to `src/lib/*` and is configured in both `tsconfig.json` and `jest.config.ts`. Never use deep relative paths like `../../../lib/types/xsd`.

### Type definitions belong in `src/lib/types/`

`xsd.ts`, `xml.ts`, and `validation.ts` are the only places shared interfaces and types live. Do not define types inline in implementation files or duplicate them.

### XSD pipeline steps return partials — not full elements

Each `PipelineStep` must only populate the fields it owns. `ElementAssembler.mergePartialElements` merges step results with a spread (`{ ...acc, ...partial }`). Two consequences:

- **Scalar fields**: the last step to write a field wins. Do not set fields you don't own.
- **Array fields** (`children`, `attributes`, `enumeration`, etc.): spread does a full replacement, not a merge. If two steps both return `children`, the second one will silently discard the first. Each array field must be owned by exactly one step.

### Resolver modules are interface-backed

Every module in `src/lib/xsd/resolvers/modules/` implements a named interface from `interfaces.ts`. When adding a new resolver module, define its interface in `interfaces.ts` first, then implement it. This keeps the orchestrator (`ModularTypeReferenceResolver`) decoupled from concrete implementations.
