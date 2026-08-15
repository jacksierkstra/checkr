---
id: CHK-011
title: "String family built-in types"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-010"]
required_context: ["docs/research/gap-analysis.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates the string family (string, normalizedString, token, language, Name, NCName, NMTOKEN, NMTOKENS, ID, IDREF, IDREFS, ENTITY, ENTITIES) `missing`: `xs:string` is a pass-through and the rest are unhandled, with no lexical-space checks and no per-type whitespace normalization. This ticket implements the family's lexical spaces on top of the facet framework.

## Deliver

Lexical-space validation for every string-family built-in, with the correct whitespace normalization per type, exercised end-to-end through the two-phase API.

## Acceptance Criteria

- [ ] `string` (preserve), `normalizedString` (replace), `token` and derived names (collapse) apply the correct whitespace normalization
- [ ] `language`, `Name`, `NCName`, `NMTOKEN` lexical rules implemented and enforced on values
- [ ] `NMTOKENS`, `IDREFS`, `ENTITIES` (space-separated lists) validate each item against the singular lexical rule
- [ ] `ID` and `ENTITY` lexical forms enforced
- [ ] Document-scoped ID uniqueness / IDREF matching is explicitly deferred to the identity-constraints ticket and listed in the outcome

## Out of Scope

- Document-scoped ID/IDREF/ENTITY cross-referencing (CHK-022)
- The regex dialect for `pattern` (CHK-015)

## Dependencies

Blocked by CHK-010 (simple-type/facet framework).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the string family's lexical spaces and per-type whitespace normalization land on the facet framework?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*
