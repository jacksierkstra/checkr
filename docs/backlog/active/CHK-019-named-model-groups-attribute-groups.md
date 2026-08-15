---
id: CHK-019
title: "Named model groups and attribute groups"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-018"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates named model groups (`xs:group`) and attribute groups (`xs:attributeGroup`) `missing` — neither is parsed, and their contents vanish. Group references (`Group_w3c.xml` 218 groups, `AttributeGroup_w3c.xml` 114 groups) are pure compile-time expansion work on the component graph.

## Deliver

Global `xs:group` and `xs:attributeGroup` definitions compiling into the graph, with `ref=` expansion into particles and attribute uses, forward references resolved, and circular references rejected.

## Acceptance Criteria

- [ ] Global model group definitions compile; `<xs:group ref="…">` expands into particles with correct occurrence
- [ ] Global attribute group definitions compile; `<xs:attributeGroup ref="…">` expands into attribute uses
- [ ] Forward references resolve via the eager multi-pass resolution (ADR §5)
- [ ] Circular group/attribute-group references are compile-time errors
- [ ] A schema using named groups validates the same instances as the equivalent inlined schema

## Out of Scope

- Content-model semantics (CHK-018 provides them; this expands on top)
- Multi-document assembly (CHK-024)

## Dependencies

Blocked by CHK-018 (the particle machinery groups expand into).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can named model groups and attribute groups land as compile-time expansion on the graph?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*