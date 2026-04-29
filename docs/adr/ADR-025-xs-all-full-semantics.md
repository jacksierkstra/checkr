# ADR-025: Full xs:all Semantics

**Status:** Proposed  
**Supersedes:** [ADR-009](./ADR-009-deferred-xsd-features.md) *(for xs:all only)*

---

## Context

ADR-009 deferred full `xs:all` semantics and introduced only a partial implementation: children of `xs:all` are tagged with `inAll: true` to exempt them from sequence-order enforcement. The remaining XSD 1.0 `xs:all` semantics are not enforced:

1. Each child element may appear **at most once** (even though `xs:all` children may declare `minOccurs="0"` or `minOccurs="1"`).
2. When a child has `minOccurs="1"`, it must appear **exactly once**.
3. `xs:all` children may not have `maxOccurs` greater than 1 (XSD 1.0 restriction — this can be validated at parse time as a schema error, or silently ignored).

The consequence is that a document containing a repeated `xs:all` child passes validation today, which is incorrect.

---

## Decision

Implement full `xs:all` semantics by:

1. Adding a new `GlobalValidationStep` — `validateAllChildren` — that:
   - Receives all child elements of the parent node and the resolved `XSDElement` schema.
   - Filters for children where `inAll === true`.
   - For each such child schema, counts occurrences in the actual element children.
   - Emits `OCCURRENCE_VIOLATION` if a child appears more than once (regardless of declared `maxOccurs`).
   - Emits `MISSING_REQUIRED_ELEMENT` if a child with `minOccurs >= 1` is absent.
2. Registering the step in `ValidatorImpl`'s `globalPipeline`, guarded by a check that the parent's children include any `inAll === true` entries.
3. Ensuring `validateSequenceOrder` continues to skip `inAll` children (no change needed — already in place).

### Out of scope for this ADR
- `xs:all` with `maxOccurs > 1` on the `xs:all` group itself (XSD 1.1 feature).
- Changing the `inAll` flag shape or the `XSDElement` type beyond what is needed.

---

## Consequences

- **Positive:** Documents that incorrectly repeat `xs:all` children now produce `OCCURRENCE_VIOLATION` errors.
- **Positive:** The partial-implementation warning in ADR-009 is resolved for `xs:all`.
- **Neutral:** Existing schemas where all `xs:all` children appear exactly once continue to pass — no false positives.
- **Negative:** Schemas that relied on silent acceptance of repeated `xs:all` children will now fail. This is a breaking validation change and should be released as a minor version bump with changelog notice.
