---
id: CHK-028
title: "XSTS-derived regression corpus"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "medium"
status: "draft"
depends_on: ["CHK-025"]
required_context: ["docs/research/gap-analysis.md", "docs/research/xsts-structure-acquisition.md"]
optional_context: ["docs/adr/architecture-component-model.md"]
assignee: null
estimate: null
---

## Context

Once all features are in place, the gap analysis's "unknown" support levels become measurable. The XSTS runner is a separate repo (CHK-006's domain), but a checkr-internal regression corpus derived from the XSTS manifests provides a quick, pre-runner progress signal. Derived cases (not copied XSTS data, respecting the W3C license's attribution requirement) exercise every feature area against the gap analysis's volume table.

## Deliver

A checkr-internal test corpus of XSTS-derived schema/instance pairs per feature area, running in the test suite and producing a pass/fail report per area.

## Acceptance Criteria

- [ ] The corpus contains derived schema/instance pairs for each feature area listed in the gap analysis, keyed to the XSTS test sets they originate from
- [ ] Each pair runs through the two-phase API and produces a correct valid/invalid outcome
- [ ] The corpus runs as part of the test suite (or a dedicated test target) and reports pass/fail counts per feature area
- [ ] The corpus is attributed to the W3C XSTS per the W3C Document License and does not contain modified copies of the original XSTS data
- [ ] The gap analysis's "unknown" levels are converted to measured levels for all implemented features

## Out of Scope

- The full XSTS runner (separate repo, CHK-006)
- Running the W3C XSTS itself (the runner owns that)

## Dependencies

Blocked by CHK-025 (all features must be implemented before the corpus can be built and all levels measured).

## Verification

```
node scripts/agent-check.mjs test
```

## Question

Can a checkr-internal XSTS-derived regression corpus be built, attributing the W3C source, and convert the gap analysis's "unknown" support levels to measured levels?

## Answer

*(to be filled on completion)*

## Decision / Outcome

*(filled in after completion)*