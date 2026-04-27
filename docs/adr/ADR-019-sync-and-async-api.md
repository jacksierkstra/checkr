# ADR-019: Expose both `validate()` (sync) and `validateAsync()` (async)

**Status:** Accepted  
**Supersedes:** [ADR-011](./ADR-011-async-api.md)

---

## Context

ADR-011 made `validate()` return `Promise<ValidationResult>` as a forward-looking affordance for potential future async features (remote schema loading via `xs:import`). The entire pipeline is synchronous. `xs:import` remains explicitly out of scope (ADR-009).

The permanent cost on all consumers is: every call to `validate()` requires `await`, even though the result is always ready synchronously. In server-side or batch validation contexts (middleware pipelines, data transformation, CLI tools), this adds unnecessary boilerplate and forces async call chains where none are needed.

---

## Decision

The `Checkr` class exposes two methods:

```ts
class Checkr {
  // Synchronous. Returns the result directly. Throws on programmer errors (ADR-018).
  // Throws if xml or xsd are not parseable.
  validate(xml: string, xsd: string): ValidationResult;

  // Async wrapper around validate(). Returns a resolved Promise.
  // Never rejects — parse errors are returned as ValidationResult values.
  validateAsync(xml: string, xsd: string): Promise<ValidationResult>;
}
```

`validate()` is the primary, recommended entry point. It is honest about the synchronous nature of the pipeline.

`validateAsync()` is provided for backwards compatibility with consumers who already `await validate(...)`, and for future use if an async feature is ever introduced. It wraps `validate()` in a `Promise.resolve()`.

The internal `ValidatorImpl` interface is updated to match:

```ts
interface Validator {
  validate(xml: string, xsd: string): ValidationResult;
  validateAsync(xml: string, xsd: string): Promise<ValidationResult>;
}
```

---

## Consequences

- **Positive:** `validate()` is honest — a sync pipeline has a sync API.
- **Positive:** Consumers in synchronous contexts (middleware, CLI, tests) do not need `await`.
- **Positive:** `validateAsync()` preserves backward compatibility for existing `await`-based consumers without a breaking change.
- **Negative:** Two entry points to document and keep in sync.
- **Negative:** `validateAsync()` is a trivial wrapper; it exists purely for compatibility and future-proofing, which may be confusing to new contributors.
- **Constraint:** If an async feature (e.g., `xs:import` with HTTP fetching) is ever implemented, `validateAsync()` is the correct extension point. `validate()` should remain synchronous.
