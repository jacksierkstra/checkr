---
id: CHK-005
title: "Gap analysis: checkr capabilities vs XSTS"
type: "ticket"
wayfinder_type: "research"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
assignee: "jacks"
depends_on: ["CHK-002", "CHK-003"]
required_context: ["docs/research/xsts-structure-acquisition.md", "src/lib/"]
optional_context: ["docs/adr/architecture-component-model.md"]
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

Full findings are documented in [docs/research/gap-analysis.md](../../research/gap-analysis.md), against the checkr source tree (`src/lib/`, all parser/resolver/validator steps and tests) and the CHK-002 XSTS structure research.

### Summary

- **No feature area is rated `full`.** checkr sits on the flat `XSDElement` pipeline model that CHK-004 found incapable of expressing the XSD 1.0 component model — the component-graph rearchitecture is the prerequisite for XSTS passage.
- **Partial**: schema element + `targetNamespace`; element declarations; attribute declarations/use/[fixed]; complex types with `sequence`; `choice` (exactly-one, document-wide count); particles/occurrence (with bugs: root `unbounded` → 1, root `minOccurs` defaults 0); `enumeration`/`pattern`/`minLength`/`maxLength` on element text (`xs:string` only); five lexical regexes for `xs:string`, `xs:integer`, `xs:decimal`, `xs:boolean`, `xs:date` (format-only). Everything else is unvalidated pass-through.
- **Missing**: `xs:all`, named model groups, `xs:attributeGroup`, wildcards (`any`/`anyAttribute`), identity constraints `unique`/`key`/`keyref`, notations, `xs:list`/`xs:union`, complex-content derivation (`complexContent`/`extension`/`restriction`), `simpleContent`, mixed content, substitution groups, `nillable`/`xsi:*`, element `default`/`fixed`, `ref=` (element/attribute/group), `include`/`import`/`redefine` — plus the entire schema-for-schemas conformance layer and the XSD regex dialect (JS `RegExp` is used today).
- **Biggest XSTS weight is datatypes + regex**: NIST 3,953 + Regex 2,591 + DataTypes 2,247 ≈ 8,791 of ~14,383 groups (~60%). Structures are dominated by Particles (856) and IdentityConstraint (840).
- **Implementation-defined / declared behaviors recorded for the future runner**: CTR-with-`all` → recommend `CTR-all-compile` (aligns with CHK-004 eager compile-time validation); target XML 1.0; target = JS runtime Unicode version, with `length`-family facets counting code points; honor `current/@status` and skip `indeterminate`/`notKnown`/disputed outcomes.
- **Complexity**: `small` — annotations (inert), notations, errata, default/fixed, boolean; `medium` — forms, declarations/refs, attribute groups, `all`, named groups, particles, wildcards, simpleContent, mixed, `xsi:*`, datatype lexical checks, list/union, most facets; `large` — the rearchitecture itself, substitution groups, complex-content derivation + CTR, identity constraints (XPath subset), include/import/redefine, schema-for-schemas, XSD regex engine, full value-space datatypes.