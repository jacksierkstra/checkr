---
id: CHK-027
title: "Errata 1.0 sweep"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "medium"
status: "done"
assignee: "jacks"
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

Implemented. All 19 Errata10 test groups (31 schema/instance pairs) produce the expected outcome, verified by running the actual XSTS data through checkr's two-phase API. In-repo regression tests live in `src/lib/xsd/compiler/errata.test.ts` as derived fixtures.

## Decision / Outcome

Four behaviors required changes:

- **E1-13 (errC005/errC006)** — local `abstract` prohibited. The compiler now reports `INVALID_DECLARATION` when a local element declaration carries an `abstract` attribute (S4S `localElement: abstract use="prohibited"`).
- **E2-24 (errE004)** — duration `T` must be absent when no time components are present; `parseDuration` rejects `P20Y0M15DT`.
- **E1-22 / R-117 (errC007)** — `xs:anyType` now has a `##any, lax` wildcard particle and attribute wildcard, so elements typed anyType (or untyped) validate content/attributes lazily.
- **E2-22 (errA003/errE006)** — `gMonth` lexical form corrected to `--MM[--](Z|±hh:mm)`; the canonical `--MM--` form with trailing dashes is accepted.

Behaviors already correct and locked in by tests: E0-23, E0-10/E1-11, E1-40, E1-9, E1-3, E1-16, E1-21, E2-27, E2-25, E2-17, E2-35.

**No deliberate divergences.** All Errata10 pairs match the suite's expected outcomes.