# ADR-005: `validate()` never throws — errors as values

**Status:** Accepted

---

## Context

Checkr is a library used inside larger applications. Consumers call `validate(xml, xsd)` and act on the result. If the function could throw, every call site would need a `try/catch` block, and uncaught exceptions in async contexts can cause difficult-to-diagnose failures.

Validation failures are not exceptional events — they are the primary output of a validation library. Treating them as exceptions conflates "the library crashed" with "the document is invalid."

Additional pressure: both the XML and XSD inputs may be malformed strings. Parse failures must be surfaced as validation errors, not propagated as exceptions.

---

## Decision

`ValidatorImpl.validate` **never throws**. Its return type is always:

```ts
interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

All exceptions — including XML/XSD parse failures — are caught at the top of `validate()` and returned as `{ valid: false, errors: ["Validation error: <message>"] }`.

All pipeline steps and resolver modules follow the same rule: they return `string[]` (empty = no errors) and never throw. If a step encounters an unexpected condition, it returns `[]` (silently skip) or a descriptive error string. It does not propagate exceptions.

---

## Consequences

- **Positive:** Consumers can unconditionally destructure the result without wrapping calls in `try/catch`.
- **Positive:** Errors from deep inside the pipeline (type resolution, restriction checking) are surfaced uniformly with the same shape as ordinary validation errors.
- **Positive:** The library is safe to use in environments where unhandled rejections / exceptions are fatal (e.g., edge runtimes, serverless).
- **Negative:** Swallowing all exceptions means that programming errors inside pipeline steps may be silently hidden behind a `valid: false` result rather than surfacing as stack traces during development. Steps should be well-tested to compensate.
- **Negative:** Distinguishing "the XML was invalid" from "the validator encountered an internal error" requires inspecting the error message string, which is a weaker contract than a typed error hierarchy (see [ADR-012](./ADR-012-string-error-messages.md)).

## Known tensions

**1. `validate()` is `async` but the pipeline is synchronous.**
The public API returns `Promise<ValidationResult>`, yet no step in the pipeline performs I/O or deferred work. The `async` wrapper is a forward-looking affordance: if remote schema loading (`xs:import` via HTTP) is ever supported, the API contract will not need to change. Until then, consumers must `await` what is effectively synchronous work. See [ADR-011](./ADR-011-async-api.md) for the full rationale.

**2. `console.warn` in validation steps.**
The `validateType` step calls `console.warn(...)` when a regex pattern is invalid. This is a side effect that violates the spirit of "errors as values" — it leaks to stderr rather than returning an error string. This is a known inconsistency: the step should instead return a descriptive error string. Until corrected, contributors should treat `console.warn` as prohibited inside pipeline steps.
