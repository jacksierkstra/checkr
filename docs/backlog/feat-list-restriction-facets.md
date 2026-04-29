# feat-list-restriction-facets: xs:restriction of xs:list with list-level facets

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

XSD 1.0 allows restricting a `xs:list` type using `xs:restriction` with list-level facets:

```xml
<xs:simpleType name="ThreeIntegers">
  <xs:restriction base="IntList">
    <xs:length value="3"/>
  </xs:restriction>
</xs:simpleType>

<xs:simpleType name="SmallIntList">
  <xs:restriction base="IntList">
    <xs:minLength value="1"/>
    <xs:maxLength value="5"/>
  </xs:restriction>
</xs:simpleType>

<xs:simpleType name="AllowedScores">
  <xs:restriction base="IntList">
    <xs:enumeration value="1 2 3"/>
    <xs:enumeration value="4 5 6"/>
  </xs:restriction>
</xs:simpleType>
```

Currently, `feat-list-type` (done) validates that each item in the list matches the `itemType`. However, the **list-level facets** that constrain the list as a whole — `xs:length`, `xs:minLength`, `xs:maxLength`, and `xs:enumeration` — are not applied when the base type is a list.

The consequence is that a list of 10 integers passes even when the schema restricts it to exactly 3.

## Acceptance Criteria

- When a `xs:restriction` targets a `xs:list` base type and declares list-level facets, the validator enforces:
  - `xs:length` — the list must contain exactly N whitespace-separated tokens
  - `xs:minLength` — the list must contain at least N tokens
  - `xs:maxLength` — the list must contain at most N tokens
  - `xs:enumeration` — the entire list value (as a string) must match one of the enumerated values
- Item-type validation (inherited from the list base) continues to apply.
- Errors use existing `ValidationErrorCode` values: `RANGE_VIOLATION` for length constraints, `TYPE_MISMATCH` for enumeration mismatches.
- Co-located tests cover: exact length, min/max length, enumeration match, enumeration mismatch, too many/too few tokens.

## Implementation Hints

1. **Parsing:** `ParseRestrictionStep` and/or `ParseListStep` already extract `minLength`, `maxLength`, `length`, and `enumeration` from restriction facets. Verify these are preserved when the restriction's base is itself a list type. No new parsing step should be needed.
2. **Resolution:** `ModularTypeReferenceResolver`'s `TypeRestrictor` module may need to carry `listItemType` from the list base type forward into the resolved element when applying the restriction.
3. **Validation:** In `validateType` (`src/lib/validator/pipeline/steps/type.ts`), when `schema.listItemType` is set and `schema.length` / `schema.minLength` / `schema.maxLength` / `schema.enumeration` are also present, apply those facets to the list token count (for length facets) or the raw string (for enumeration).
4. Alternatively, extract a dedicated `validateListFacets` helper and call it from the type step.
