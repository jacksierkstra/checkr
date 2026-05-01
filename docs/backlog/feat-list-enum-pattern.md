# feat-list-enum-pattern: xs:list enumeration and pattern facets on full list value

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | low     |
| Status   | backlog |

## Problem

When `xs:list` is restricted, the facets `xs:minLength`, `xs:maxLength`, and `xs:length` correctly apply to the **number of list items**. However, `xs:enumeration` and `xs:pattern` facets are also valid on list restrictions per XSD 1.0 spec (they apply to the full whitespace-separated string value), but are currently ignored.

Example:

```xml
<xs:simpleType name="ShortColorList">
  <xs:restriction base="xs:NMTOKENS">
    <xs:enumeration value="red green"/>
    <xs:enumeration value="blue yellow"/>
  </xs:restriction>
</xs:simpleType>
```

A value of `"red green"` should be valid (it is one of the enumerated values). `"red blue"` should be invalid. Today no enumeration check is performed.

## Acceptance Criteria

- `xs:enumeration` on a list restriction is validated against the full whitespace-normalised list string.
- `xs:pattern` on a list restriction is applied to the full value string.
- `xs:minLength`/`xs:maxLength`/`xs:length` continue to count tokens as before.
- New test covers enumeration and pattern on list restrictions.

## Implementation Hints

1. In `src/lib/validator/pipeline/steps/type.ts`, in the `listItemType` branch, after token-count facets, also check `schema.enumeration` and `schema.pattern` against the full (whitespace-normalised) value string.
2. These facets are already checked for non-list types; the list branch simply needs to include them.
