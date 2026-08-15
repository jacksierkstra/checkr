---
id: CHK-012
title: "Numeric family and bound facets"
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

The gap analysis rates numeric support `partial`: only `xs:integer`/`xs:decimal` regexes exist, `xs:float`/`xs:double` (used in the benchmark fixture!) are unvalidated, and no bounds facets exist. This ticket implements the numeric family's lexical and value spaces plus the order/scale facets on the facet framework.

## Deliver

`decimal`, `float`, `double`, and the full integer hierarchy with correct value spaces, special values, and the `minInclusive`/`maxInclusive`/`minExclusive`/`maxExclusive`/`totalDigits`/`fractionDigits` facets.

## Acceptance Criteria

- [x] `decimal` lexical + arbitrary-precision value space with correct rounding semantics
- [x] `float`/`double` lexical forms including exponents and the special values INF, -INF, NaN
- [x] `integer` and all derived integers (nonPositive, negative, long, int, short, byte, nonNegative, unsignedLong, unsignedInt, unsignedShort, unsignedByte, positive) with correct bounds
- [x] The four bound facets apply on numeric types, including across restriction chains
- [x] `totalDigits`/`fractionDigits` apply per XSD semantics
- [x] The integer family derives from `decimal` as a restriction chain in the type hierarchy

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

Yes — the numeric family's lexical/value spaces and the order/scale facets land as described.

Key design decisions:

1. **Value spaces are exact for decimal-family types (arbitrary precision, string-based).**   
   A `CanonicalDecimal` representation splits the value into `{sign, intDigits, fracDigits}`   
   with leading/trailing zeros stripped, enabling exact comparison and digit counting without   
   IEEE rounding.  Zero is normalised to sign=+1.

2. **Float/double use IEEE 754 via JS Number + Math.fround.**   
   `xs:float` uses `Math.fround` for binary32 rounding; `xs:double` uses `Number` directly   
   (binary64).  Special values INF, -INF, NaN are handled.  NaN is compared via IEEE "unordered"   
   and violates all four bound facets, matching the XSD ordering definition.

3. **The mantissa sign for float/double is accepted.**   
   The spec grammar omits a sign on the mantissa but requires the mantissa to follow the decimal   
   lexical rules, which do allow a sign.  Every major implementation accepts signed mantissae,   
   so we do too.

4. **Integer lexical validation disallows the decimal point.**   
   `xs:integer` and its derived types reject "1.0" lexically, while a user-defined decimal   
   restriction with `fractionDigits=0` would accept it (the facet check handles the value-space   
   constraint).  This matches the XSD spec: integer's lexical space is `('+'|'-')? [0-9]+`.

5. **Built-in numeric types carry their own bound facets** in the `builtinTypes.ts` definitions,   
   and `effectiveFacets` is now computed through the restriction chain via `computeEffectiveFacets`.   
   This makes the integer hierarchy (integer→long→int→short→byte, etc.) a proper restriction chain   
   where each type inherits `fractionDigits=0` from integer and overrides or inherits bounds.

6. **`validateFacets` accepts an optional `type` parameter** for value-space context.  Without it,   
   numeric facets are skipped (backward-compatible).

## Decision / Outcome

Implementation complete as `numeric-types.ts` (new), `facets.ts` (extended), `builtinTypes.ts`   
(updated numeric defs with facets and effectiveFacets computation), `instanceValidator.ts`   
(wired numeric lexical check + type param).  All acceptance criteria met; 4 files changed,   
1 new file created.