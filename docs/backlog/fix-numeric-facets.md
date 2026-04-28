# fix-numeric-facets: Numeric facets dropped for xs: base restrictions

| Field    | Value    |
|----------|----------|
| Type     | bug      |
| Priority | critical |
| Status   | done     |

## Problem

When a `xs:restriction` uses an XSD built-in base type (e.g., `base="xs:integer"`), the parser calls `parseBasicRestrictionFacets` but **not** `parseNumericRestrictionConstraints`. As a result, facets like `xs:minInclusive`, `xs:maxInclusive`, `xs:minExclusive`, and `xs:maxExclusive` are silently dropped.

**Affected file:** `src/lib/xsd/pipeline/steps/restriction.ts` → `parseSimpleTypeRestriction()`

Example schema that is silently broken:

```xml
<xs:simpleType name="AgeType">
  <xs:restriction base="xs:integer">
    <xs:minInclusive value="0"/>
    <xs:maxInclusive value="120"/>
  </xs:restriction>
</xs:simpleType>
```

The restriction produces `{ type: "xs:integer" }` — the range constraints are lost. Any value passes validation.

## Acceptance Criteria

- `xs:restriction base="xs:integer"` with `xs:minInclusive`/`xs:maxInclusive`/`xs:minExclusive`/`xs:maxExclusive` correctly populates the corresponding fields on the parsed element.
- `xs:restriction base="xs:decimal"` (and other numeric xs: types) behaves the same way.
- Existing string-facet tests (pattern, enumeration, minLength, maxLength) continue to pass.
- A new test in `restriction.test.ts` covers `base="xs:integer"` + numeric facets.

## Implementation Hints

1. In `parseSimpleTypeRestriction()`, after calling `parseBasicRestrictionFacets`, also call `parseNumericRestrictionConstraints` and merge the result.
2. `parseNumericRestrictionConstraints` populates a `XSDRestriction` object; for xs: base types, the facets should be applied directly to the `Partial<XSDElement>` (not wrapped in `restriction`), matching how string facets are handled.
3. No changes to `XSDRestriction` or `XSDElement` types are needed — the fields already exist.
