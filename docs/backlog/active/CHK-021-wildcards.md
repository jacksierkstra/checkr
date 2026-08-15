---
id: CHK-021
title: "Wildcards"
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

The gap analysis rates wildcards `missing` — `xs:any` and `xs:anyAttribute` are unparsed. The `Wildcards_w3c.xml` set (315 groups) and Sun `Wildcard.testSet` exercise namespace constraints, `processContents` (strict/lax/skip), and attribute wildcards. This is a self-contained feature on the declaration layer (CHK-017).

## Deliver

`xs:any` and `xs:anyAttribute` with namespace constraint evaluation, `processContents` semantics, and correct wildcard behavior in derivation.

## Acceptance Criteria

- [ ] `xs:any` particles: namespace constraint (`##any`, `##other`, `##targetNamespace`, `##local`, explicit list) enforced on instance elements
- [ ] `processContents="strict"`: wildcard-matched elements validated against their declarations; `"lax"`: validated if a declaration exists, skipped otherwise; `"skip"`: no validation
- [ ] `xs:anyAttribute` with the same namespace constraint and processContents semantics
- [ ] Wildcard intersection/union rules for type derivation (the `notNamespace` and `notQName` constraints if applicable)
- [ ] A Wildcard-test-set-style schema validates correctly

## Out of Scope

- Identity constraints (CHK-022)
- Multi-document namespace resolution (CHK-024)

## Dependencies

Blocked by CHK-017 (declarations the wildcard lax/strict mode delegates to).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can wildcards (any/anyAttribute, processContents, namespace constraints) land on the declaration layer?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*