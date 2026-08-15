---
id: CHK-020
title: "Complex-content derivation"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-017", "CHK-010"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates complex-content derivation `missing` — no `complexContent`, `extension`, `restriction`, `simpleContent`, or `mixed` content support exists. The XSTS's `ComplexType_w3c.xml` (551 groups) and `Additional_w3c.xml` (287 groups) heavily exercise derivation. The ADR's compile-time validation model makes this the right home for the **CTR-with-`all`** implementation-defined choice (declared as `CTR-all-compile` per the gap analysis §5).

## Deliver

`complexContent` extension/restriction, `simpleContent` extension/restriction, `mixed` content, and the CTR-with-`all` compile-time rejection under the declared `CTR-all-compile` option.

## Acceptance Criteria

- [ ] `complexContent` extension: base type content extended with new particles/attribute uses, derivation rules enforced
- [ ] `complexContent` restriction: effective content model restricted per the spec's derivation rules
- [ ] `simpleContent` extension/restriction: simple types with attributes, works with the facet framework (CHK-010)
- [ ] `mixed` content: text mixed with elements validated per spec
- [ ] Complex-type restriction with `all`-groups is always rejected at compile time (`CTR-all-compile` option)
- [ ] Invalid derivations (per spec rules) are compile-time errors, not instance-validation errors

## Out of Scope

- Wildcards in derivation (CHK-021)
- Substitution groups interacting with type hierarchy (CHK-023)

## Dependencies

Blocked by CHK-017 (declarations the types inhabit) and CHK-010 (simple types for simpleContent).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can complex-content derivation (extension/restriction, simpleContent, mixed, CTR-all-compile) land on the component graph?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*