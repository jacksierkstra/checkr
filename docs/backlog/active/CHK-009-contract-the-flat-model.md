---
id: CHK-009
title: "Contract the flat model"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-008"]
required_context: ["src/lib/", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/gap-analysis.md"]
assignee: null
estimate: null
---

## Context

With the component-graph core (CHK-008) landed, the old flat model (`XSDElement` bag-of-fields, its pipeline steps, type-reference resolver, and validator walk) is dead weight: it is the substrate the gap analysis found incapable of expressing the XSD 1.0 component model. This ticket deletes it and migrates all call sites onto the new two-phase API — the contract step of the rearchitecture sequence.

## Deliver

The old flat-model pipeline fully removed; tests, benchmark, and README migrated to the new API; CI green on the new surface only.

## Acceptance Criteria

- [ ] The old flat model, its parse-pipeline steps, resolver, and validator walk are deleted
- [ ] All call sites (tests, benchmark, README, public exports) use the two-phase API
- [ ] Tests retired for behavior the new surface does not yet cover are listed in the ticket outcome, so feature tickets can re-cover them deliberately
- [ ] `test`, `build`, and `guardrails` checks pass

## Out of Scope

- Re-implementing behavior the old pipeline had — that is the feature slices (CHK-010 onwards), which restore and improve it on the graph

## Dependencies

Blocked by CHK-008 (the new surface must exist before the old one is deleted).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
node scripts/agent-check.mjs guardrails
```

## Question

Can the old flat model be deleted and the repository migrate to the new API with CI green on the new surface?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*
