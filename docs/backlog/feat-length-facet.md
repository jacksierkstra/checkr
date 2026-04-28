# feat-length-facet: xs:length restriction facet

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

The `xs:length` facet (exact character/item count) is not represented in the type system, not parsed from XSD, and not validated. Schemas using `<xs:length value="N"/>` inside a restriction silently ignore the constraint.

## Acceptance Criteria

- `xs:length` in a restriction is parsed and stored on the element/restriction.
- Validation rejects string values whose length does not equal the declared `xs:length` value.
- `xs:length` coexists correctly with `xs:minLength`/`xs:maxLength` (having all three is technically contradictory in XSD, but the library should not crash).
- A new test covers the `xs:length` facet.

## Implementation Hints

1. **Type** (`src/lib/types/xsd.ts`): Add `length?: number` to both `XSDRestriction` and `XSDElement`.
2. **Parsing** (`ParseRestrictionsStep`): In `extractFacets`, add extraction of `<xs:length>` alongside `minLength`/`maxLength`.
3. **Validation** (`validateConstraints` and/or `validateType`): Add a check: if `schema.length != null && text.length !== schema.length`, emit `RANGE_VIOLATION`.
