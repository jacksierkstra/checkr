---
id: CHK-012
title: "Numeric family and bound facets"
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

The gap analysis rates numeric support `partial`: only `xs:integer`/`xs:decimal` regexes exist, `xs:float`/`xs:double` (used in the benchmark fixture!) are unvalidated, and no bounds facets exist. This ticket implements the numeric family's lexical and value spaces plus the order/scale facets on the facet framework.

## Deliver

`decimal`, `float`, `double`, and the full integer hierarchy with correct value spaces, special values, and the `minInclusive`/`maxInclusive`/`minExclusive`/`maxExclusive`/`totalDigits`/`fractionDigits` facets.

## Acceptance Criteria

- [ ] `decimal` lexical + arbitrary-precision value space with correct rounding semantics
- [ ] `float`/`double` lexical forms including exponents and the special values INF, -INF, NaN
- [ ] `integer` and all derived integers (nonPositive, negative, long, int, short, byte, nonNegative, unsignedLong, unsignedInt, unsignedShort, unsignedByte, positive) with correct bounds
- [ ] The four bound facets apply on numeric types, including across restriction chains
- [ ] `totalDigits`/`fractionDigits` apply per XSD semantics
- [ ] The integer family derives from `decimal` as a restriction chain in the type hierarchy

## Out of Scope

- Date/time value spaces (CHK-013)
- List/union wrapping of numeric types (CHK-016)

## Dependencies

Blocked by CHK-010 (simple-type/facet framework).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the numeric family's lexical and value spaces plus the order/scale facets land on the facet framework?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*