---
id: CHK-024
title: "Multi-document schemas"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-017"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates `include`, `import`, and `redefine` `missing` — checkr is a single-document parser today. The ADR's grammar-per-namespace model (CHK-017) is the natural substrate: `xs:include` merges same-namespace schemas, `xs:import` creates foreign grammars, and `xs:redefine` augments existing components. `xsi:schemaLocation`/`xsi:noNamespaceSchemaLocation` let the instance document declare where to find schemas at validation time.

## Deliver

Multi-document schema assembly: `include` (same-namespace merge), `import` (cross-namespace grammar), `redefine` (augment), and runtime schema resolution via `xsi:schemaLocation`/`xsi:noNamespaceSchemaLocation`.

## Acceptance Criteria

- [ ] `xs:include`: included documents merged into the same target namespace grammar; duplicate component detection
- [ ] `xs:import`: imported namespace creates a foreign grammar; QName resolution crosses grammars
- [ ] `xs:redefine`: components redefined with the spec's augmentation rules
- [ ] `xsi:schemaLocation`/`xsi:noNamespaceSchemaLocation` honored at validation time, resolving to the correct grammar
- [ ] Multi-document schemas compile and validate instances end-to-end

## Out of Scope

- Schema-for-schemas conformance checks on the assembled result (CHK-025)

## Dependencies

Blocked by CHK-017 (grammar-per-namespace foundation).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can multi-document schema assembly (include/import/redefine) and xsi:schemaLocation land on the grammar-per-namespace layer?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*