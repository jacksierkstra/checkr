---
id: CHK-026
title: "Notations and annotations"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "medium"
status: "draft"
depends_on: ["CHK-008"]
required_context: ["docs/research/gap-analysis.md"]
optional_context: ["docs/adr/architecture-component-model.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates notations `missing` and annotations `partial (inert)`. The `Notations_w3c.xml` set (116 groups) exercises notation declarations and their interplay with `NOTATION`-typed values; `Annotations_w3c.xml` (80 groups, 0 instance tests) is effectively inert — annotations have no validity effect. This ticket parses both into the graph and wires the notation ↔ NOTATION-type link.

## Deliver

Notation declarations in the component graph, wired to `NOTATION`-typed values (CHK-014), and annotation parsing with no validity effect.

## Acceptance Criteria

- [ ] `xs:notation` declarations compile into the graph with name, public and system identifiers
- [ ] `NOTATION`-typed values (from CHK-014) reference a declared notation; undeclared notations are validation errors
- [ ] `xs:annotation`/`xs:documentation`/`xs:appinfo` parse and attach to their parent component without affecting validity
- [ ] Annotations-only tests (which verify no validity effect) pass vacuously

## Out of Scope

- The full NOTATION value space (lexical form is in CHK-014; this ticket wires the declaration link)

## Dependencies

Blocked by CHK-008 (component-graph core).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can notations and annotations land in the component graph with the notation↔NOTATION-type link?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*