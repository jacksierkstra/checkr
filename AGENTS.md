# Checkr – Agent Instructions

Checkr is a TypeScript library that validates XML documents against XSD schemas. It targets both Node.js 18+ and browser environments and has **zero runtime dependencies** — it uses the native `DOMParser` API available in Node.js 18+ and all modern browsers.

The public API returns `ValidationResult: { valid: boolean; errors: ValidationError[] }`. Errors are structured objects with a stable `code` field, never plain strings. Parse errors (malformed XML/XSD) are always returned as `ValidationResult` values. Programmer errors inside pipeline steps are **re-thrown** so they surface as stack traces rather than silent `valid: false` results.

## Commands

```sh
npm test                                         # full test suite + coverage
npm run build                                    # compile → dist/ (use tspc, not tsc)
npm run clean                                    # delete dist/

npx jest src/lib/xsd/parser.test.ts             # single test file
npx jest --testNamePattern="validates type"     # tests matching a name pattern

npm run lint                                     # ESLint (must pass with 0 warnings)
npm run lint:fix                                 # auto-fix lint violations
npm run format:check                             # Prettier check (CI gate)
npm run format                                   # reformat all source files
```

## Commit messages

All commits must follow the **[Conventional Commits](https://www.conventionalcommits.org/)** format. CI blocks non-conforming messages via `commitlint`.

```
feat: add xs:sequence ordering validation
fix: correct minOccurs default when attribute is absent
chore: update dependencies
docs: clarify dual-namespace lookup removal
test: add coverage for xs:restriction pattern
refactor: extract numeric facet logic into helper
```

Breaking changes require a `!` suffix or `BREAKING CHANGE:` footer:

```
feat!: replace string errors with structured ValidationError
```

## Backlog

All known bugs and planned features are tracked in [`docs/backlog/README.md`](docs/backlog/README.md).

**Rules for agents:**

1. **Before starting** any XSD feature or bugfix, check `docs/backlog/README.md`. If the item exists, set its `Status` to `in-progress` in both the index and the item's `.md` file.
2. **After completing** an item, update its `Status` to `done` in both files.
3. **When you discover a new gap** (a bug or missing feature not already listed), create a new `docs/backlog/<id>.md` file using the template in `docs/backlog/README.md` and add a row to the index table.
4. Keep the index and individual files **in sync** — status must be consistent between them.

---

## Out-of-scope XSD features — do not implement

The following XSD features are explicitly deferred. Do not implement them unless asked:

- `xs:all`
- `xs:key`, `xs:unique`, `xs:keyref`
- `xs:import`, `xs:include`
- `xs:group`, `xs:attributeGroup`

Attempting partial support for any of these will silently produce wrong validation results.

## Architecture overview

The library is split into three responsibilities wired together in `Checkr`:

1. **`XMLParserImpl`** — parses raw XML strings into a DOM via native `DOMParser`  
2. **`XSDPipelineParserImpl`** — parses XSD strings into an `XSDSchema` object tree  
3. **`ValidatorImpl`** — walks the XML DOM against the parsed schema and collects errors

Do not merge these responsibilities.

### Public API surface

`src/index.ts` exports **only**:

```ts
export { Checkr } from "@lib/core/main";
export type { ValidationResult, ValidationError, ValidationErrorCode } from "@lib/types/validation";
```

Implementation classes (`XMLParserImpl`, `XSDPipelineParserImpl`, `ValidatorImpl`) and their interfaces are **internal**. Never add a new export to `src/index.ts` without explicit architectural justification.

### Module format

The build output is **ESM-only** (`"type": "module"` in `package.json`). Do not add a `"require"` export condition or CJS output. The minimum supported Node.js version is **18**.

### Error handling contract

`ValidatorImpl.validate` splits errors into two categories:

- **Parse errors** (malformed XML or XSD input) — caught and returned as `ValidationResult` with `code: "PARSE_ERROR"`. The caller never needs a `try/catch` for bad input.
- **Programmer errors** (a `TypeError`, `RangeError`, or unexpected `null` inside a pipeline step or resolver) — **re-thrown**. These are bugs in the library. Swallowing them would hide them behind a silent `valid: false`.

Validation steps and resolvers must follow the same rule:
- Return `ValidationError[]` (empty = no errors). Never throw.
- If a step encounters an unexpected node type, a null reference, or a malformed attribute it cannot handle: return `[]` and skip it silently, or return a descriptive `ValidationError`. Do not invent a separate error handling strategy.

A `ValidationError` has this shape (all fields except `code` and `message` are optional):

```ts
interface ValidationError {
  code: ValidationErrorCode;  // stable, machine-readable — key on this in tests
  message: string;            // human-readable English — NOT a stable API, may change
  element?: string;           // local name of the XML element involved
  expected?: unknown;         // schema expectation (type name, min/max, pattern, …)
  actual?: unknown;           // value or count found in the document
}
```

Do not add retry logic or Promise rejection handling around the public `validate` method.

### Test environment

The test environment is `jest-environment-jsdom`. Do not change it. The library targets both Node.js and browsers, and tests must exercise the browser `DOMParser` path that `jest-environment-jsdom` provides as a spec-compliant global.

## How to add support for a new XSD feature

This is the most common change to this codebase. Follow these steps in order:

**1. Add fields to the schema types** (`src/lib/types/xsd.ts`)  
Add any new properties to `XSDElement`, `XSDRestriction`, `XSDExtension`, or introduce a new interface if needed. This is the source of truth for what the library understands.

**2. Add an XSD parsing step** (`src/lib/xsd/pipeline/steps/`)  
Create a new class implementing `PipelineStep<Element, Partial<XSDElement>>`. The `execute` method receives a raw DOM `Element` and must return **only the fields it is responsible for** as a `Partial<XSDElement>`. Do not return a full object. Register it in `XSDPipelineParserImpl` by calling `.addStep(new YourStep())`.

**3. Add a validation step if needed** (`src/lib/validator/pipeline/steps/`)  
If the new feature requires runtime validation, create a function matching `NodeValidationStep = (node: Element, schema: XSDElement) => ValidationError[]` or `GlobalValidationStep = (nodes: Element[], schema: XSDElement) => ValidationError[]`. Register node-level steps in `ValidatorImpl`'s `nodePipeline`, occurrence-style steps in `globalPipeline`.

Each function must return `ValidationError[]` — never `string[]`, never `void`. Use a structured `code` from `ValidationErrorCode` and populate `element`, `expected`, and `actual` where applicable. Example:

```ts
import { NodeValidationStep, ValidationError } from "@lib/types/validation";

export const validateMyFeature: NodeValidationStep = (node, schema) => {
  const errors: ValidationError[] = [];
  // ...
  errors.push({
    code: "TYPE_MISMATCH",
    message: `Element <${schema.name}> must be X, but found "${node.textContent}".`,
    element: schema.name,
    expected: "X",
    actual: node.textContent,
  });
  return errors;
};
```

**4. Update the resolver if the feature involves type references**  
Use this rule to decide:
- If the feature is a **new form of type inheritance** (e.g., `xs:union`): add a new module + interface pair in `src/lib/xsd/resolvers/modules/`, following the pattern in `interfaces.ts`.
- If the feature **extends existing inheritance behaviour** (e.g., a new property on `xs:extension`): update the relevant existing module behind its existing interface.

**5. Write a co-located test file**  
Place `yourFeature.test.ts` next to `yourFeature.ts`. Use inline XML/XSD strings — no fixture files. Tests must be self-contained and avoid file I/O so the test suite runs identically in Node.js and browser environments.

## Critical conventions

### DOM querying — use `getElementsByTagNameNS` directly

The library uses the native `DOMParser` API, which handles XML namespaces correctly. Always query using the XSD namespace URI and the local tag name:

```ts
const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

const el = parent.getElementsByTagNameNS(XSD_NAMESPACE, "sequence")[0] as Element;
```

Do **not** add a `getElementsByTagName("xs:sequence")` fallback — this was required by the old `@xmldom/xmldom` dependency but is no longer needed and can match unrelated elements. For checking a single element's identity, use a helper like `ParseExtensionStep.isXsdElement()` as the canonical pattern:

```ts
private isXsdElement(el: Element, name: string): boolean {
  return el.localName === name && el.namespaceURI === this.XSD_NAMESPACE;
}
```

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

### Common mistakes — anti-patterns to avoid

| ❌ Wrong | ✅ Right |
|---|---|
| Return `string[]` from a validation step | Return `ValidationError[]` with a `code` field |
| `getElementsByTagName("xs:sequence")` lookup | `getElementsByTagNameNS(XSD_NAMESPACE, "sequence")` |
| `import … from "@xmldom/xmldom"` | Use native DOM globals (`Element`, `Document`) — no import needed |
| Catch all exceptions in `validate()` | Only catch parse errors; let programmer errors propagate |
| Export implementation classes from `src/index.ts` | Export only `Checkr` and the public types |
| Use `console.warn` / `console.log` in pipeline steps | Return a `ValidationError` or `[]`; no side-effects |
| Assert on exact `error.message` text in tests | Assert on `error.code` — messages are not a stable API |

