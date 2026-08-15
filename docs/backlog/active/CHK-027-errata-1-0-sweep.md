---
id: CHK-027
title: "Errata 1.0 sweep"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "medium"
status: "draft"
depends_on: ["CHK-025"]
required_context: ["docs/research/gap-analysis.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The `Errata10_w3c.xml` set (19 groups, 12 instance tests) covers fixes published in the XSD 1.0 Second Edition Errata. These are small corrections to spec behavior, each affecting a specific feature area. Rather than fold them into feature tickets (where they could be overlooked), this sweep ticket addresses them in one pass after all features are in place.

## Deliver

Each behavior in the Errata10 test set either implemented or explicitly documented as intentionally divergent with a rationale.

## Acceptance Criteria

- [ ] Every schema/instance pair in the Errata10 set produces the expected outcome (valid/invalid per the suite)
- [ ] Any deliberately divergent behavior is documented in this ticket's Outcome with the spec rationale

## Out of Scope

- XSD 1.1 fixes (the effort targets 1.0 only)

## Dependencies

Blocked by CHK-025 (all features must be in place before the errata can be checked against them).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the Errata 1.0 behaviors be implemented or explicitly diverged from, with the Errata10 set passing?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*