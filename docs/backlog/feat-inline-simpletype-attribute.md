# feat-inline-simpletype-attribute: Inline xs:simpleType child of xs:attribute

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

An `xs:attribute` declaration in XSD 1.0 can define its type constraint either via the `type` attribute (a reference) or via an inline `xs:simpleType` child element:

```xml
<xs:attribute name="status">
  <xs:simpleType>
    <xs:restriction base="xs:string">
      <xs:enumeration value="active"/>
      <xs:enumeration value="inactive"/>
    </xs:restriction>
  </xs:simpleType>
</xs:attribute>
```

`ParseAttributesStep` currently reads only the `type` attribute value. When an attribute uses an inline `xs:simpleType`, the child element is silently ignored. The parsed attribute ends up with `type: "xs:string"` and no facets, so pattern/enumeration/length constraints on the attribute are never validated.

## Acceptance Criteria

- When `xs:attribute` has an inline `xs:simpleType` child with a `xs:restriction`, the restriction's facets (enumeration, pattern, minLength, maxLength, length) are extracted and stored on the `XSDAttribute`.
- The attribute validator applies these inline facets during validation (enumeration check, pattern check, etc.).
- When both `type` attribute and inline `xs:simpleType` are present, inline `xs:simpleType` takes precedence (per XSD 1.0 spec).
- Co-located tests cover: attribute with inline enumeration restriction; attribute with inline pattern restriction; attribute with both `type` and inline simpleType (inline wins).

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Extend `XSDAttribute` with optional facet fields mirroring `XSDRestriction`: `enumeration?: string[]`, `pattern?: string`, `minLength?: number`, `maxLength?: number`, `length?: number`.
2. **Parsing (`ParseAttributesStep`):** After reading the `type` attribute, check for a `xs:simpleType` child. If found, call the existing restriction-parsing logic (or a shared helper extracted from `ParseRestrictionsStep`) to extract facets onto the attribute record.
3. **Validation (`validateAttributes` or a new helper):** When checking an attribute value, if the schema attribute carries inline facets, apply them (enumeration membership, pattern match, length bounds).
