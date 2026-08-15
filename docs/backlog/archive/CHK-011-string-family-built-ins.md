---
id: CHK-011
title: "String family built-in types"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
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

Yes. All string-family lexical spaces now land on the facet framework and are enforced end-to-end through the two-phase API.

## Decision / Outcome

### Public surface

- **New module**: `src/lib/xsd/string-types.ts` — lexical-space validators for the string family, plus `checkStringFamilyLexicalSpace` which walks a type's base chain to find its most-specific string-family built-in ancestor and applies that ancestor's lexical check.
- **New error code**: `LEXICAL_SPACE_VIOLATION` added to the `SchemaErrorCode` union. Violations report this code from instance validation, separate from `FACET_VIOLATION`.

### Lexical rules implemented

- **`xs:language`** — `[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*` per XSD 1.0 Part 2 §3.2.17 (primary tag letters only; subtags may be alphanumeric).
- **`xs:Name`** — XML 1.0 (Fifth Edition) Name production: NameStartChar then NameChar*. Implemented as code-point tests, so supplementary-plane NameStartChar/NameChar ranges (#x10000–#xEFFFF) work.
- **`xs:NCName`** — Name with no colons.
- **`xs:NMTOKEN`** — one or more NameChar characters (digits/hyphens/dots allowed at the start).
- **`xs:ID`**, **`xs:IDREF`**, **`xs:ENTITY`** — NCName lexical form enforced.
- **List types `xs:NMTOKENS`, `xs:IDREFS`, `xs:ENTITIES`** — split on whitespace and validate each item against the singular rule.
- **`xs:string` / `xs:normalizedString` / `xs:token`** — no additional lexical check: `string` accepts anything, and `normalizedString` (no #x9/#xA/#xD) / `token` (no leading/trailing/internal-consecutive whitespace) are fully handled by their whiteSpace normalization (replace / collapse) which runs before lexical checks.

### Validator integration

- `validateTextValue` now runs `checkStringFamilyLexicalSpace` on the normalized value before facet checks. Both `LEXICAL_SPACE_VIOLATION` and `FACET_VIOLATION` are reported when a value violates both (violations compound).
- Applies to element text content, simpleContent text, and attribute values — all three validation paths share `validateTextValue`.

### Key design decisions

- **Whitespace normalization precedes lexical checks.** The lexical spaces of `normalizedString` and `token` are defined on the normalized value, so no check is needed after collapse/replace normalization — this matches XSD 1.0 Part 2 §4.3.6.
- **Most-specific built-in ancestor wins.** `checkStringFamilyLexicalSpace` stops at the first string-family built-in found walking up the base chain (e.g. a restriction of `xs:ID` checks the ID lexical rule, not `xs:NCName`'s). This was the key bug found during TDD — the first draft overwrote the ancestor on each step, so every restricted type fell through to `xs:string` and no check ran.
- **Deferred (CHK-022):** document-scoped ID uniqueness, IDREF/ENTITY cross-referencing. Only the lexical forms are enforced here.

### Verification

All tests pass: 48 new unit tests (`src/lib/xsd/string-types.test.ts`) + 10 new integration tests in the instance-validator suite. `node scripts/agent-check.mjs full` → `AGENT_CHECK_FULL_PASS`.
