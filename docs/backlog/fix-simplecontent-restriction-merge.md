# fix-simplecontent-restriction-merge: xs:simpleContent restriction facet and attribute merge

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | low    |
| Status   | backlog |

## Problem

`<xs:complexType><xs:simpleContent><xs:restriction>` can declare both facets (narrowing the text content type) and attributes. The current implementation parses facets and attributes separately, but the merge between base-type facets and the derived restriction's facets may be incomplete — particularly when the base type is a named type with its own facets that should be inherited and optionally overridden.

Example:

```xml
<xs:complexType name="Base">
  <xs:simpleContent>
    <xs:extension base="xs:integer">
      <xs:attribute name="unit" type="xs:string" use="required"/>
    </xs:extension>
  </xs:simpleContent>
</xs:complexType>

<xs:complexType name="Derived">
  <xs:simpleContent>
    <xs:restriction base="Base">
      <xs:maxInclusive value="100"/>
      <!-- attribute 'unit' should still be required -->
    </xs:restriction>
  </xs:simpleContent>
</xs:complexType>
```

The derived type should inherit `unit` from `Base` and add a `maxInclusive` constraint. Today, the attribute inheritance may be silently dropped.

## Acceptance Criteria

- Attributes declared on the base type are inherited by the simpleContent restriction.
- Facets from the restriction narrow those from the base type (the derived range must be a subset).
- A `RANGE_VIOLATION` is produced when the element value exceeds the restriction's `maxInclusive`.
- Existing simpleContent tests continue to pass.

## Implementation Hints

1. In `src/lib/xsd/resolvers/modules/TypeRestrictor.ts`, when processing a simpleContent restriction, ensure base-type attributes are merged with (not replaced by) the derived type's attributes.
2. Facet merging: use the more restrictive value when both base and derived specify the same facet (e.g., the minimum of two `maxInclusive` values).
3. The `feat-simplecontent-restriction-facets` backlog item covered facet extraction; this item focuses on attribute inheritance correctness.
