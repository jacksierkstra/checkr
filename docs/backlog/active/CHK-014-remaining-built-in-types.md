---
id: CHK-014
title: "Remaining built-in types"
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

Four built-in families remain unhandled after the string, numeric, and date/time tickets: binary (`hexBinary`, `base64Binary`), URI (`anyURI`), and the name-space types (`QName`, `NOTATION`), plus `boolean`, whose current check the gap analysis flags as missing whitespace-collapse-before-lexing. This ticket closes the built-in catalogue.

## Deliver

`hexBinary`, `base64Binary`, `anyURI`, `QName`, `NOTATION`, and `boolean` with correct lexical and value-space behavior.

## Acceptance Criteria

- [ ] `hexBinary` and `base64Binary` validate lexical form (including the `length`/`minLength`/`maxLength` facets measured in octets per the spec)
- [ ] `anyURI` validates per its lexical rules
- [ ] `QName` values parse as `{namespaceURI}localName` resolved against in-scope namespaces
- [ ] `NOTATION`-typed values must reference a declared notation; the type works with notation declarations once those land (CHK-026)
- [ ] `boolean` collapses whitespace before accepting exactly true/false/1/0

## Out of Scope

- Notation declarations themselves (CHK-026)
- Namespace machinery for QName resolution (CHK-017 provides the in-scope namespace context)

## Dependencies

Blocked by CHK-010 (simple-type/facet framework).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the remaining built-ins (binary, anyURI, QName, NOTATION, boolean) land on the facet framework?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*