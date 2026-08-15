---
id: CHK-005
title: "Gap analysis: checkr capabilities vs XSTS"
type: "ticket"
wayfinder_type: "research"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-002", "CHK-003"]
required_context: ["docs/research/xsts-structure-acquisition.md", "src/lib/"]
optional_context: ["docs/adr/architecture-component-model.md"]
assignee: null
estimate: null
---

## Context

The map's destination is passing the XSTS for XSD 1.0. We know the XSTS structure (CHK-002) and the target architecture (CHK-004, documented in `docs/adr/architecture-component-model.md`). What we don't yet know is: which features does checkr currently support, which are partially supported, and which are missing entirely? This gap analysis produces the concrete comparison that drives the implementation order.

## Must Follow

Follow the research skill protocol: produce a markdown summary as a linked asset.

## Do Not

Do not make scheduling or ordering decisions — that's a separate ticket once the gap analysis is complete. Do not implement any features.

## Deliver

A markdown document `docs/research/gap-analysis.md` that:

1. Lists every XSD 1.0 feature area (types, elements, attributes, model groups, identity constraints, wildcards, notations, etc.)
2. For each feature area, maps checkr's current support level: **full** (passes XSTS tests), **partial** (some tests pass, others fail), **missing** (no implementation), or **unknown** (no test coverage yet)
3. Identifies the specific XSTS test groups/sets that exercise each feature, cross-referencing the XSTS manifest structure from CHK-002
4. Flags any features that are implementation-defined in the XSTS and how checkr should handle them
5. Estimates relative complexity (small/medium/large) for each missing or partial feature

## Acceptance Criteria

- [ ] The markdown document covers all major XSD 1.0 Part 1 and Part 2 feature areas
- [ ] Each feature area has a clear support level and a reference to relevant XSTS test groups
- [ ] Missing and partial features are flagged with complexity estimates
- [ ] The document is linked from this ticket's Answer section

## Out of Scope

- Implementation of any features
- Feature implementation order (that's a separate ticket)
- Writing test runners or test harnesses

## Risks

- The XSTS is large (~2000+ tests); this analysis may be time-consuming
- Some features may have unclear pass/fail boundaries due to overlapping test groups
- Checkr's current codebase may not cleanly separate feature areas, making the analysis subjective

## Dependencies

Depends on CHK-002 (XSTS structure and acquisition) and CHK-003 (reference architecture research) — both are done.

## Verification

```
ls docs/research/gap-analysis.md
```

## Question

Which XSD 1.0 features does checkr currently support, partially support, or not support at all, compared to what the XSTS requires?

## Answer

*(to be filled on resolution)*