---
id: CHK-007
title: "Decide feature implementation order for XSTS progress"
type: "ticket"
wayfinder_type: "grilling"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-005"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The destination is passing the XSTS, and the route's two inputs now exist: the target architecture (CHK-004, ADR at `docs/adr/architecture-component-model.md`) and the capability gap analysis (CHK-005, `docs/research/gap-analysis.md`). The gap analysis shows ~60% of the suite's ~14,383 test groups are datatypes + regex (NIST 3,953 + Regex 2,591 + DataTypes 2,247), with structures dominated by particles (856) and identity constraints (840) — and that *no* feature area can pass before the component-graph rearchitecture lands. What remains is the scheduling decision: in what order should feature work proceed to maximize early XSTS progress, given the rearchitecture as a gating prerequisite?

## Must Follow

Follow the grilling skill protocol: conversation, one question at a time.

## Do Not

Do not implement features. Do not redesign the architecture (that's CHK-004's settled decision). Produce a decision, not a deliverable.

## Deliver

A decision, recorded in this ticket's Answer, that specifies:

1. Whether feature reimplementation starts only after the full component-graph rearchitecture, or interleaves with it (and why)
2. The ordered list of feature areas to implement, with the rationale per position (XSTS test volume from the gap analysis, complexity ratings, cross-feature dependencies)
3. Which implementation-defined/test-outcome policies from the gap analysis (CTR-with-`all` option, Unicode/XML version declarations) are fixed as part of scheduling
4. What "done" looks like for the ordering decision — i.e. what gates handoff to execution

## Acceptance Criteria

- [ ] The Answer lists a concrete, dependency-sound ordering of feature areas
- [ ] Each ordering choice is justified with reference to XSTS volume (gap analysis §6) and complexity (gap analysis §7)
- [ ] The decision is linked from this ticket's Answer section

## Out of Scope

- Implementing any feature
- The test runner design (that's CHK-006)
- Redeciding checkr's architecture (CHK-004 is settled)

## Risks

- Ordering datatypes first maximizes raw group count but identity constraints are the structural risk (XPath subset, explicitly flagged difficult in CHK-004)
- The rearchitecture scope could grow beyond one effort; the ordering decision should not assume a fixed feature budget
- Over-eager ordering without the runner (CHK-006) leaves progress unmeasurable — this decision should state whether a minimal runner lands before or alongside early features

## Dependencies

Depends on CHK-005 (gap analysis) — done. The ordering decision consumes the gap analysis's volume and complexity tables. CHK-006 (test runner design) is a related but independent decision; this ticket should state how the two interact.

## Verification

```
node scripts/agent-check.mjs validate-brief
```

## Question

In what order should checkr's XSD 1.0 feature work proceed — after and relative to the CHK-004 component-graph rearchitecture — to maximize early, measurable progress on the XSTS?

## Answer

*(to be filled on resolution)*