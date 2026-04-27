# ADR-020: Structured validation errors with codes

**Status:** Accepted  
**Supersedes:** [ADR-012](./ADR-012-string-error-messages.md)

---

## Context

ADR-012 chose `errors: string[]` for its simplicity. The weaknesses identified in that ADR have become concrete pain points:

- Consumers who need to distinguish error types (missing element vs. type mismatch vs. cardinality violation) must parse the English error string — a fragile coupling to exact wording.
- Error message wording is not versioned; it can change in a patch release and break consumer tests silently.
- Internationalisation is impossible without a breaking change.
- The move to a typed error hierarchy (ADR-018) makes plain strings inconsistent with the overall direction of the public API.

---

## Decision

`ValidationResult.errors` is replaced with `ValidationResult.errors: ValidationError[]`, where `ValidationError` is a new structured type:

```ts
export type ValidationErrorCode =
  | "MISSING_REQUIRED_ELEMENT"
  | "UNEXPECTED_ELEMENT"
  | "TYPE_MISMATCH"
  | "PATTERN_MISMATCH"
  | "RANGE_VIOLATION"
  | "OCCURRENCE_VIOLATION"
  | "ATTRIBUTE_MISSING"
  | "ATTRIBUTE_INVALID"
  | "CHOICE_VIOLATION"
  | "ABSTRACT_ELEMENT"
  | "PARSE_ERROR";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;        // human-readable English sentence (same as before)
  element?: string;       // local name of the XML element involved, if applicable
  expected?: unknown;     // schema expectation (e.g., type name, min/max, pattern)
  actual?: unknown;       // value or count found in the document
}

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};
```

All pipeline steps are updated to return `ValidationError[]` instead of `string[]`. The `message` field carries the existing human-readable text, so consumer UIs that display error messages are unaffected. The `code` field enables machine-readable branching and stable test assertions.

---

## Consequences

- **Positive:** Consumers can branch on `error.code` without string-parsing.
- **Positive:** `error.message` wording can be improved in patch releases without breaking consumer logic (since consumers should key on `code`, not `message`).
- **Positive:** Internationalisation is now possible: consumers map `code` to a localised string.
- **Positive:** `expected` and `actual` fields enable richer error displays (e.g., "expected integer, got 'abc'").
- **Negative:** **Breaking change** — `errors: string[]` becomes `errors: ValidationError[]`. All consumers must be updated.
- **Negative:** Every pipeline step must be updated to return `ValidationError[]`, touching a large portion of the codebase.
- **Constraint:** `ValidationErrorCode` is a versioned public API. Adding a new code is non-breaking (additive); removing or renaming a code is a breaking change requiring a semver major bump.
- **Constraint:** The `message` field is *not* a stable API — it may change in any release. Consumers must not assert on exact message text.
