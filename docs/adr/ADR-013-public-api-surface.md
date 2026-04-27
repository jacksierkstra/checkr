# ADR-013: Implementation classes are part of the public API

**Status:** Accepted

---

## Context

`src/index.ts` exports the following:

```ts
export { Checkr } from "@lib/core/main";
export { ValidationResult } from "@lib/types/validation";
export { Validator, ValidatorImpl } from "@lib/validator/validator";
export { XMLParser, XMLParserImpl } from "@lib/xml/parser";
export { XSDParser } from "@lib/xsd/parser";
export { XSDPipelineParserImpl } from "@lib/xsd/pipeline/parser";
```

This exposes not just the `Checkr` facade, but also the internal implementation classes (`XMLParserImpl`, `XSDPipelineParserImpl`, `ValidatorImpl`) and the interfaces they implement (`XMLParser`, `XSDParser`, `Validator`).

Two design philosophies compete here:

1. **Narrow API (facade only):** Export only `Checkr` and `ValidationResult`. Internal components are invisible to consumers. Refactoring internals is always non-breaking.
2. **Wide API (DI-friendly):** Export interfaces and implementations so consumers can:
   - Inject a custom XML or XSD parser into `ValidatorImpl`
   - Subclass or replace components for specialised use cases
   - Write integration tests against the interfaces directly

The project currently follows philosophy 2, making the internal architecture part of the versioned public API.

---

## Decision

Export implementation classes and interfaces alongside the `Checkr` facade.

This enables dependency injection and allows consumers to extend or replace individual components. The pipeline interfaces (`XMLParser`, `XSDParser`, `Validator`) form a stable extension point contract.

---

## Consequences

- **Positive:** Advanced consumers can inject custom parsers or validators (e.g., a faster XML parser, a caching XSD parser).
- **Positive:** Testability of individual components is improved for consumers who want to unit-test their own extensions.
- **Negative:** Any internal rename or restructuring of exported classes/interfaces is a breaking API change that requires a semver major bump.
- **Negative:** The public API surface is significantly larger than the minimum necessary (`Checkr` + `ValidationResult`), making the library harder to document and maintain.
- **Negative:** Consumers can construct `ValidatorImpl` with incorrect dependencies (e.g., mismatched parser instances), bypassing the wiring that `Checkr` provides safely.
- **Recommendation:** Consider whether `XMLParserImpl` and `XSDPipelineParserImpl` specifically need to be exported. The interfaces (`XMLParser`, `XSDParser`) are sufficient for DI without exposing the concrete implementations.
