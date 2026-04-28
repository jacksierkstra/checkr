# feat-total-fraction-digits: xs:totalDigits / xs:fractionDigits facets

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | done |

## Problem

The `xs:totalDigits` and `xs:fractionDigits` facets for controlling decimal precision are absent from the type system, parsing, and validation. Schemas using these facets silently ignore the constraints.

- `xs:totalDigits` — maximum number of significant digits (integer + fraction combined)
- `xs:fractionDigits` — maximum digits after the decimal point

## Acceptance Criteria

- Both facets are parsed from restriction elements and stored on the schema type.
- `xs:totalDigits` is enforced: a decimal with more significant digits fails.
- `xs:fractionDigits` is enforced: a decimal with more fraction digits fails.
- Constraints only apply to numeric types (`xs:decimal`, `xs:float`, `xs:double`).
- New tests cover both facets.

## Implementation Hints

1. **Type** (`src/lib/types/xsd.ts`): Add `totalDigits?: number` and `fractionDigits?: number` to `XSDRestriction` and `XSDElement`.
2. **Parsing** (`ParseRestrictionsStep`): In `parseNumericRestrictionConstraints`, add extraction of `xs:totalDigits` and `xs:fractionDigits` elements.
3. **Validation** (`validateType`): In the `xs:decimal`/`xs:float`/`xs:double` case, after parsing the float value, check total significant digits and fraction digits against schema constraints.
