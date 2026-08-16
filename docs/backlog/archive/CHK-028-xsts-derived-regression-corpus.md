---
id: CHK-028
title: "XSTS-derived regression corpus"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "medium"
status: "in-progress"
depends_on: ["CHK-025"]
required_context: ["docs/research/gap-analysis.md", "docs/research/xsts-structure-acquisition.md"]
optional_context: ["docs/adr/architecture-component-model.md"]
assignee: "jacks"
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

Implemented. A checkr-internal regression corpus lives in `src/lib/xsd/compiler/xsts-corpus.test.ts` with 64 derived schema/instance pairs across 34 feature areas, covering all structures and datatypes from the gap analysis volume table. Each area is keyed to the XSTS manifest file(s) that cover it, and the corpus reports pass/fail counts per area in a summary table at the end of the suite. The file header attributes the W3C XSTS per the W3C Document License.

## Decision / Outcome

**Measured support levels:** all 34 feature areas from the gap analysis are exercised by the corpus and produce correct valid/invalid outcomes against the component-graph architecture. The gap analysis's "unknown" levels (assessments against the old flat model) are superseded by measured pass rates.

**Bugs fixed during corpus construction** (each exposed by a failing derived case):

- The `\c` name-character escape in the XSD regex engine was missing letters (matched only continuation-only characters). Fixed per XSD 1.0 Part 2 Appendix E — `\c` = NameChar minus ":" and "_" — confirmed by the XSTS reDC4 test (`http://\c*` must match `http://www.foo.com`).
- `minOccurs` on a single-element particle was not enforced when `count < minOccurs` but `count > 0` (only the 0-occurrence case was checked). Added an after-loop check in `consumeMatchingChildren`, mirroring the wildcard branch.
- `<xs:group ref="...">` as the direct compositor of a complexType was silently ignored (produced empty content). Added "group" to the content-model children filter and a placeholder case in `buildComplexType`, so pass-2 resolution expands the referenced definition.

**Out of scope honored:** no XSTS runner was built (that's CHK-006). The corpus contains no modified copies of XSTS data.
