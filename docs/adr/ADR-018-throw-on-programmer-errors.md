# ADR-018: Throw on programmer errors — preserve "errors as values" for validation failures

**Status:** Accepted  
**Supersedes:** [ADR-005](./ADR-005-error-as-values.md)

---

## Context

ADR-005 established that `validate()` **never throws** — all exceptions, including internal programmer errors, are caught and returned as `{ valid: false, errors: ["Validation error: ..."] }`.

This blanket catch has a significant downside: a `TypeError` from a null dereference inside a pipeline step and a legitimate "element is missing" validation failure produce identical output. Bugs inside the library are invisible during development; they surface as confusing `valid: false` results with opaque messages.

There are two fundamentally different error kinds:

1. **Validation failures** — the document does not conform to the schema. These are the *expected* output of the library and should be returned as values in `ValidationResult`.
2. **Programmer errors** — a `TypeError`, `RangeError`, or unexpected `null` inside a pipeline step or resolver. These are bugs in the library. Swallowing them hides them.

---

## Decision

The error boundary in `validate()` is split:

- **Validation failures** (i.e., errors returned by pipeline steps as `ValidationError[]`) continue to be collected and returned in `ValidationResult`. Pipeline steps never throw.
- **Programmer errors** (i.e., exceptions thrown by pipeline steps, the assembler, the resolver, or the parser due to programming mistakes) are **re-thrown** rather than swallowed.

Concretely, `ValidatorImpl.validate` uses **two separate `try/catch` blocks** — one wrapping the `xsdParser.parse(xsd)` call and one wrapping the `xmlParser.parse(xml)` call. Each catches any error thrown by that parser and returns it as a `ValidationResult` with `code: "PARSE_ERROR"`. All other code (pipeline steps, assembler, resolver) runs outside any `try/catch`, so programmer errors from those paths propagate as unhandled exceptions.

Pipeline steps retain the contract: **return `ValidationError[]`, never throw**. A step that throws due to a bug in its own code will surface as an uncaught exception — which is the correct behaviour for a programmer error.

> **Note:** When this ADR was written, pipeline steps returned `string[]`. [ADR-020](./ADR-020-structured-validation-errors.md) subsequently changed the return type to `ValidationError[]`. The error-boundary split described above remains unchanged.

The `console.warn` call in `validateType` (a known violation of ADR-005) is replaced with a proper returned error as part of this change.

---

## Consequences

- **Positive:** Programmer bugs inside the library surface as stack traces in development rather than as silent `valid: false` results.
- **Positive:** The distinction between "this document is invalid" and "the validator has a bug" is now observable at runtime.
- **Positive:** The `console.warn` side-effect violation (noted in ADR-005) is eliminated.
- **Negative:** Consumers who previously relied on `validate()` never throwing must now handle the case where it throws for programmer errors. (The async contract still holds for parse failures on malformed input.)
- **Constraint:** Parse errors from malformed XML/XSD inputs must continue to be returned as `ValidationResult` values, not thrown. Only internal programming mistakes propagate as exceptions.
