---
id: CHK-013
title: "Date/time family built-in types"
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

The gap analysis rates date/time support `partial` and notes the existing `xs:date` check is a shape regex — `2023-13-45` passes. The nine date/time types with timezone rules and value-space ordering are entirely missing. This ticket implements the family with real calendar validity on the facet framework.

## Deliver

`dateTime`, `date`, `time`, `gYear`, `gYearMonth`, `gMonth`, `gMonthDay`, `gDay`, and `duration` with genuine calendar validity, timezone rules, and value-space ordering where the XSTS requires it.

## Acceptance Criteria

- [ ] Each of the eight date/time types has a correct lexical definition and calendar validity (no 13th month, no 45th day, correct leap years)
- [ ] Timezone handling: `Z`, `±hh:mm`, absent timezone, and timezone-affects-value-space rules per the spec
- [ ] `duration` lexical + value space with the negative component rules
- [ ] Value-space comparisons work for order facets (`minInclusive` etc.) on these types
- [ ] Restriction-derived date/time types behave per the derivation rules

## Out of Scope

- Numeric types (CHK-012)
- Regex dialect (CHK-015)

## Dependencies

Blocked by CHK-010 (simple-type/facet framework).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the date/time family land with real calendar validity, timezone rules, and value-space ordering?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*