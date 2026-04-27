# ADR-021: Narrow public API — export only `Checkr` and `ValidationResult`

**Status:** Accepted  
**Supersedes:** [ADR-013](./ADR-013-public-api-surface.md)

---

## Context

ADR-013 chose to export implementation classes (`XMLParserImpl`, `XSDPipelineParserImpl`, `ValidatorImpl`) alongside the `Checkr` facade, motivated by dependency injection and advanced consumer use cases.

The consequences of this decision are now clear:

- Every internal rename or restructuring is a breaking change requiring a semver major bump.
- The public API surface is large and requires documentation for components that most consumers will never use.
- Consumers can construct `ValidatorImpl` with mismatched dependencies, bypassing the correct wiring that `Checkr` provides.
- The ADR itself noted in its Recommendation: "Consider whether `XMLParserImpl` and `XSDPipelineParserImpl` specifically need to be exported."

The narrow facade option was always the simpler and more maintainable choice; it was deferred in favour of DI flexibility that has not been used.

---

## Decision

`src/index.ts` exports **only**:

```ts
export { Checkr } from "@lib/core/main";
export type { ValidationResult, ValidationError, ValidationErrorCode } from "@lib/types/validation";
```

All implementation classes (`XMLParserImpl`, `XSDPipelineParserImpl`, `ValidatorImpl`) and their interfaces (`XMLParser`, `XSDParser`, `Validator`) are no longer part of the public API. They remain in the source tree but are not exported.

This is a **breaking change**. Consumers who imported internal classes must migrate to using `Checkr` directly.

---

## Consequences

- **Positive:** Internal implementation details can be freely renamed, restructured, or replaced without a semver major bump.
- **Positive:** The public API is minimal: one class, one result type, one error type, one code enum. Easy to document.
- **Positive:** Consumers cannot misuse internal wiring.
- **Negative:** Consumers who were injecting custom parsers or validators lose their extension point. The recommended migration is to wrap `Checkr` in an adapter class.
- **Negative:** Breaking change — consumers importing internal classes must update their imports.
- **Constraint:** If a legitimate extension point is needed in the future (e.g., a custom XSD parser), it should be exposed as a stable, intentionally designed interface on `Checkr` (e.g., `new Checkr({ xsdParser: myParser })`), not by re-exporting implementation classes.
