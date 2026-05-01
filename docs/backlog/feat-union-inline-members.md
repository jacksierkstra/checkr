# feat-union-inline-members: xs:union with inline xs:simpleType member children

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

`xs:union` supports two forms of member type specification:

1. **`memberTypes` attribute:** `<xs:union memberTypes="xs:string xs:integer"/>` — currently supported.
2. **Inline children:** `<xs:union><xs:simpleType>...</xs:simpleType><xs:simpleType>...</xs:simpleType></xs:union>` — not currently supported.

The second form allows union members to be anonymous inline types (e.g., a list type, a restriction, etc.). These inline `<xs:simpleType>` children are silently discarded, causing the union validation to skip those members.

Example:

```xml
<xs:simpleType name="SpecialList">
  <xs:union>
    <xs:simpleType>
      <xs:list itemType="xs:integer"/>
    </xs:simpleType>
    <xs:simpleType>
      <xs:restriction base="xs:string">
        <xs:enumeration value="none"/>
      </xs:restriction>
    </xs:simpleType>
  </xs:union>
</xs:simpleType>
```

A value of `"none"` should be valid; an integer list like `"1 2 3"` should be valid. Today both fail.

## Acceptance Criteria

- Inline `<xs:simpleType>` children within `<xs:union>` are parsed and their constraints are collected.
- Union validation tries all member types (both `memberTypes`-declared and inline-declared) and accepts a value if any member matches.
- The existing `memberTypes` attribute path continues to work unchanged.

## Implementation Hints

1. **Parse step:** In `src/lib/xsd/pipeline/steps/union.ts`, after extracting `memberTypes`, also iterate over `<xs:simpleType>` child elements. For each, recursively parse its restriction/list content to produce an inline `XSDElement` describing the member.
2. **Type change:** Consider adding `unionInlineMembers?: XSDElement[]` to `XSDElement` in `src/lib/types/xsd.ts` alongside `unionMemberTypes`.
3. **Validation:** In `src/lib/validator/pipeline/steps/type.ts`, when processing union validation, also try each inline member's constraints (type + facets) in addition to named `unionMemberTypes`.
