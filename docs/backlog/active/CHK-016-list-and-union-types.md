---
id: CHK-016
title: "List and union types"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-010", "CHK-011", "CHK-012", "CHK-013", "CHK-014"]
required_context: ["docs/research/gap-analysis.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates `xs:list` and `xs:union` `missing` — the NIST list/union data is untouched. List types split values on whitespace and validate each item against an item type; union types accept a value if any member type accepts it. Both sit on top of the atomic-type families and the facet framework.

## Deliver

`xs:list` and `xs:union` simple types with correct item/member semantics, plus enumeration and pattern working across derived simple types.

## Acceptance Criteria

- [ ] `xs:list`: values split on whitespace; each item validates against the item type; list facets (`length`/`minLength`/`maxLength`) apply to the item count, `pattern`/`enumeration` to the whole lexical form
- [ ] `itemTypeFacets` (min/max length, pattern) apply to items where declared
- [ ] `xs:union`: a value is valid if at least one member type accepts it; union member resolution per spec
- [ ] Enumeration/pattern facets work across restriction chains and on derived simple types (the gap analysis flags these as currently dropped by type-reference resolution)
- [ ] A NIST-style list and union schema/instance pair validates end-to-end through the two-phase API

## Out of Scope

- Atomic type families themselves (CHK-011–014)

## Dependencies

Blocked by CHK-010 (facet framework) and the atomic families CHK-011–014 (item/member types must exist to validate against).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can list and union types land with correct item/member semantics on top of the atomic families?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*