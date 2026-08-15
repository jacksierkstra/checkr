---
id: CHK-008
title: "Two-phase API and component-graph core"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: []
required_context: ["docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/reference-xsd-validator-architectures.md", "src/lib/"]
assignee: null
estimate: null
---

## Context

The architecture decision (CHK-004, ADR at `docs/adr/architecture-component-model.md`) commits checkr to a typed component graph with a two-phase API: `compileSchema()` → immutable `CompiledSchema`, then `validate()` → `ValidationResult`, with errors reported through a listener-style `SchemaError` taxonomy. This is the foundation ticket: build that surface *beside* the existing pipeline so nothing breaks, per the expand step of the rearchitecture sequence.

## Deliver

A working two-phase API on a typed component graph for a minimal schema: one global element declaration with an inline simple or complex type, QName identity, eager compile-time resolution of type references, and a `SchemaError` taxonomy (severity, code, message, location, phase) delivered via a listener.

## Acceptance Criteria

- [ ] `compileSchema()` accepts an XSD document string and returns an immutable `CompiledSchema`; mutating the input after compile has no effect on the compiled schema
- [ ] `validate()` accepts an XML document against a `CompiledSchema` and returns valid/invalid plus a list of `SchemaError`s carrying severity, code, message, location, and phase
- [ ] A minimal schema (global element + inline type) compiles, and conforming / non-conforming instances validate correctly in both directions
- [ ] Unresolvable type references are compile-time errors, surfaced through the error listener (eager multi-pass resolution per ADR §5)
- [ ] The existing single-shot API keeps working unchanged — the current test suite still passes

## Out of Scope

- Schema-for-schemas conformance (later ticket)
- PSVI (explicitly deferred by the ADR)
- Any feature beyond the minimal compile/validate round trip

## Dependencies

None — can start immediately.

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the two-phase API and a minimal typed component graph land beside the existing pipeline with the current test suite staying green?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*
