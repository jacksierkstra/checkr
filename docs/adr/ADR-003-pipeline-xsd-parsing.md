# ADR-003: Pipeline pattern for XSD parsing

**Status:** Accepted

---

## Context

An XSD element definition can carry a large number of orthogonal concerns: its name and type, nested child elements, attributes, restriction facets, extension inheritance, and so on. A single monolithic parser function that handles all of these concerns would be:

- Hard to test in isolation — any single concern would require setting up the full parser.
- Hard to extend — adding support for a new XSD feature (e.g., `xs:enumeration`) would require modifying a large, shared function.
- Fragile — changes to one concern could silently break another.

---

## Decision

XSD parsing is structured as a **pipeline of small, focused steps**. Each step implements:

```ts
interface PipelineStep<TInput, TOutput> {
  execute(input: TInput): TOutput;
}
```

Each step receives a DOM `Element` and returns **only the fields it is responsible for** as a `Partial<XSDElement>`. The `ElementAssembler` merges all partial results with a spread (`{ ...acc, ...partial }`).

Steps are registered in `XSDPipelineParserImpl` via `.addStep(new YourStep())` and run in order. Each array field (`children`, `attributes`, `enumeration`, etc.) is owned by exactly one step to avoid silent overwrite.

---

## Consequences

- **Positive:** Each step is independently unit-testable with minimal setup.
- **Positive:** Adding a new XSD feature requires writing a new step file rather than modifying existing logic.
- **Positive:** Steps are composable — the same pipeline infrastructure is reused for validation (see [ADR-004](./ADR-004-pipeline-validation.md)).
- **Negative:** The merge-by-spread strategy means that if two steps accidentally write the same array field, the earlier step's data is silently discarded. Ownership of fields must be maintained as a convention, not enforced by the type system.
- **Negative:** Because each step only returns a partial, the full `XSDElement` only exists after assembly, which can make debugging harder when a field is unexpectedly absent.
