# ADR-012: Error messages are plain strings — no error codes

**Status:** Accepted

---

## Context

`ValidationResult.errors` is typed as `string[]`. Every validation failure produces a human-readable English sentence such as:

```
Element <bar> is required inside <root> but is missing.
Element <age> must be an integer, but found "abc".
Choice error: Expected exactly one of [a, b], but found 0.
```

An alternative would be structured error objects:

```ts
interface ValidationError {
  code: string;         // e.g. "MISSING_REQUIRED_ELEMENT"
  message: string;      // human-readable
  element?: string;     // element name involved
  expected?: unknown;   // schema expectation
  actual?: unknown;     // found value
}
```

Forces considered:

- **Simplicity:** `string[]` requires no additional types in the public API and is trivial for consumers to log or display.
- **Machine-readability:** Consumers who want to react differently to, say, a missing element vs. a pattern mismatch must currently parse the error string — a fragile dependency on the exact wording.
- **Internationalisation:** String messages are in English with no mechanism for translation. Structured errors with codes would allow consumers to provide localised messages.
- **Scope:** The library is currently focused on providing correct yes/no validation with descriptive messages. Fine-grained error categorisation is an additional feature, not a core requirement.
- **Stability:** Error messages are not part of a versioned contract — their exact wording can change in patch releases. Error codes would need to be treated as a stable, versioned API surface.

---

## Decision

`ValidationResult.errors` remains `string[]`. No error codes or structured error objects are introduced.

This keeps the public API surface minimal. Human-readable strings are sufficient for the current use cases (logging, displaying to end users).

---

## Consequences

- **Positive:** The public API (`ValidationResult`) stays minimal — a single boolean and a string array.
- **Positive:** New validation rules can be added without introducing new error code constants into the public API.
- **Negative:** Consumers who need to distinguish error types (e.g., "show a different UI for missing elements vs. type errors") must resort to string matching, which is fragile.
- **Negative:** Internationalisation of error messages is not possible without a breaking change.
- **Negative:** Error message wording is not a versioned contract, creating an implicit instability for consumers who rely on specific error text in tests.
- **Future:** If structured errors become necessary, the recommended path is to add an optional `details` field to `ValidationResult` rather than replacing `errors`, to maintain backwards compatibility.
