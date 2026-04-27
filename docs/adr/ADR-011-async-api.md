# ADR-011: `validate()` returns a `Promise` despite a synchronous pipeline

**Status:** Accepted

---

## Context

The public API entry point is:

```ts
class Checkr {
  validate(xml: string, xsd: string): Promise<ValidationResult>;
}
```

Every component in the validation pipeline — XML parsing, XSD parsing, type resolution, and all validation steps — is **synchronous**. No network call, no file I/O, and no deferred work of any kind takes place today. The `async` keyword on `validate()` and the `async parse()` on `XSDParser` are wrappers around fully synchronous code.

This is a deliberate mismatch between the API surface and the current implementation.

Forces considered:

- **Future extensibility:** The XSD specification supports `xs:import` and `xs:include`, which can reference external schema documents by URI. A library that fully supports these features would need to fetch schemas over HTTP — an inherently async operation. Changing a sync API to async later is a **breaking change** for all consumers; changing an async API to return resolved values is **non-breaking** (consumers already `await`).
- **Consumer friction:** Callers must `await validate(...)` or chain `.then()` even when the result is ready synchronously. This adds boilerplate for a very common usage pattern.
- **Simplicity of the current implementation:** Making `validate()` sync today would yield a cleaner API for the current feature set, but would require a breaking semver bump whenever async features are added.

---

## Decision

`validate()` returns `Promise<ValidationResult>` and is declared `async`, even though the current implementation resolves synchronously.

This is a **forward-looking contract**: it keeps the door open for future async features (notably remote schema loading via `xs:import`) without a breaking API change. The async nature of the API is accepted as a constant cost on all consumers in exchange for future flexibility.

---

## Consequences

- **Positive:** Adding async features (e.g., `xs:import` with HTTP-fetched schemas) will not require a breaking API change.
- **Positive:** The API is consistent with the "never throws" contract (see [ADR-005](./ADR-005-error-as-values.md)) — `Promise` rejection is never used; all errors appear in the resolved `ValidationResult`.
- **Negative:** Consumers must `await` a call that today resolves synchronously. This adds unnecessary boilerplate in server-side or batch validation contexts.
- **Negative:** The async wrapper obscures the fact that the pipeline is synchronous, which can mislead contributors into assuming I/O is involved.
- **Note:** If the decision is made to never support remote schema loading (e.g., `xs:import` remains out of scope per [ADR-009](./ADR-009-deferred-xsd-features.md)), the async API should be revisited and a sync alternative should be introduced via a new ADR.
