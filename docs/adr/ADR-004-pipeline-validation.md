# ADR-004: Pipeline pattern for validation

**Status:** Accepted

---

## Context

XML validation against an XSD schema involves many independent checks: element name, type, occurrence constraints, required children, attribute presence, string restrictions, numeric ranges, and more. The same architectural pressures that drove the pipeline pattern for XSD parsing (see [ADR-003](./ADR-003-pipeline-xsd-parsing.md)) apply to validation:

- A monolithic validator is hard to extend and test.
- Each validation concern should be independently verifiable.
- New XSD features need to add validation logic without touching unrelated checks.

Two kinds of validation steps exist:

- **Node-level:** run once per XML element, checking properties of that element against its schema definition.
- **Global (occurrence-level):** run across all instances of an element type, checking cardinality constraints that require a full population count.

A third kind — **document-level** — exists in the codebase but is not part of either pipeline: these functions receive the full `XMLDocument` and `XSDSchema` and are called directly from `validate()`. Currently only `validateRootElements` uses this pattern (checks that required root elements are present). It is not registered in a pipeline because it needs the document root and the whole schema, not a single `XSDElement`.

---

## Decision

`ValidatorImpl` uses two composable pipelines:

```ts
type NodeValidationStep = (node: Element, schema: XSDElement) => ValidationError[];
type GlobalValidationStep = (nodes: Element[], schema: XSDElement) => ValidationError[];
```

Node-level steps are registered in `nodePipeline`. Occurrence-style steps are registered in `globalPipeline`. Every step returns a `ValidationError[]` (empty = no errors). Steps **never throw** (see [ADR-018](./ADR-018-throw-on-programmer-errors.md)).

> **Note:** When this ADR was written, steps returned `string[]`. [ADR-020](./ADR-020-structured-validation-errors.md) replaced plain strings with structured `ValidationError` objects. The pipeline contract is otherwise unchanged.

---

## Consequences

- **Positive:** Validation concerns are separated and independently testable.
- **Positive:** Adding a new validation rule requires creating a new step function and registering it — no changes to existing steps.
- **Positive:** The two-pipeline design cleanly separates per-node checks from cardinality checks that need context across all siblings.
- **Negative:** The pipeline abstraction adds a small layer of indirection compared to a flat `if/else` chain. New contributors must understand the two-step-type distinction.
- **Negative:** Step order within a pipeline is determined by registration order. If steps have implicit ordering dependencies, those must be enforced by convention.
