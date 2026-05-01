# feat-attr-numeric-facets: Numeric facets on xs:attribute inline xs:simpleType

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

The attribute validation step (`src/lib/validator/pipeline/steps/attributes.ts`) checks string-style facets (`enumeration`, `pattern`, `length`, `minLength`, `maxLength`) but does **not** check numeric facets (`minInclusive`, `maxInclusive`, `minExclusive`, `maxExclusive`, `totalDigits`, `fractionDigits`) when an attribute has an inline `xs:simpleType` with a numeric restriction.

Example:

```xml
<!-- XSD -->
<xs:element name="score">
  <xs:complexType>
    <xs:attribute name="value">
      <xs:simpleType>
        <xs:restriction base="xs:integer">
          <xs:minInclusive value="0"/>
          <xs:maxInclusive value="100"/>
        </xs:restriction>
      </xs:simpleType>
    </xs:attribute>
  </xs:complexType>
</xs:element>

<!-- XML — should FAIL: 150 > 100 -->
<score value="150"/>
```

Today this passes.

## Acceptance Criteria

- Attribute values with inline `xs:simpleType` restrictions are validated against `minInclusive`, `maxInclusive`, `minExclusive`, `maxExclusive`, `totalDigits`, and `fractionDigits`.
- Validation produces a `RANGE_VIOLATION` error with `expected` and `actual` populated.
- Existing attribute tests continue to pass.

## Implementation Hints

1. **Type change:** `XSDAttribute` already has `minLength`, `maxLength`, `length` fields. Add `minInclusive?`, `maxInclusive?`, `minExclusive?`, `maxExclusive?`, `totalDigits?`, `fractionDigits?` to `XSDAttribute` in `src/lib/types/xsd.ts`.
2. **Parse step:** In `src/lib/xsd/pipeline/steps/attributes.ts`, when parsing inline `<xs:simpleType><xs:restriction>`, extract numeric facets alongside the existing string facets.
3. **Validation step:** In `src/lib/validator/pipeline/steps/attributes.ts`, add a `validateAttrNumericFacets` helper analogous to `validateAttrFacets` and call it for non-empty values.
