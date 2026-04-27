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

---

## Decision

`ValidatorImpl` uses two composable pipelines:

```ts
type NodeValidationStep = (node: Element, schema: XSDElement) => string[];
type GlobalValidationStep = (nodes: Element[], schema: XSDElement) => string[];
```

Node-level steps are registered in `nodePipeline`. Occurrence-style steps are registered in `globalPipeline`. Every step returns a `string[]` of error messages (empty = no errors). Steps **never throw** (see [ADR-005](./ADR-005-error-as-values.md)).

---

## Consequences

- **Positive:** Validation concerns are separated and independently testable.
- **Positive:** Adding a new validation rule requires creating a new step function and registering it — no changes to existing steps.
- **Positive:** The two-pipeline design cleanly separates per-node checks from cardinality checks that need context across all siblings.
- **Negative:** The pipeline abstraction adds a small layer of indirection compared to a flat `if/else` chain. New contributors must understand the two-step-type distinction.
- **Negative:** Step order within a pipeline is determined by registration order. If steps have implicit ordering dependencies, those must be enforced by convention.
