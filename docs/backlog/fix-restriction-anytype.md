# fix-restriction-anytype: xs:restriction base="xs:anyType" not handled

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | low    |
| Status   | backlog |

## Problem

`xs:anyType` is the root of the XSD type hierarchy; every complex type implicitly derives from it. A schema may use it explicitly as a restriction base:

```xml
<xs:complexType name="Unconstrained">
  <xs:complexContent>
    <xs:restriction base="xs:anyType">
      <xs:sequence>
        <xs:element name="value" type="xs:string"/>
      </xs:sequence>
    </xs:restriction>
  </xs:complexContent>
</xs:complexType>
```

When `TypeRestrictor` resolves `base="xs:anyType"`, it looks up the name in `schema.types` and finds nothing, so restriction processing may silently fail or produce unexpected results. The content model declared in the restriction body should be used directly without any base-type merging.

## Acceptance Criteria

- Restricting from `xs:anyType` produces a valid `XSDElement` with the children/attributes declared in the restriction body.
- No error is thrown or swallowed during parsing.
- Validation of instance documents against the resulting element works correctly.

## Implementation Hints

1. In `src/lib/xsd/resolvers/modules/TypeRestrictor.ts`, add an early-exit check: if `restriction.base === "xs:anyType"`, treat the restriction content (children, attributes, facets) as the complete type definition without attempting to look up and merge a base type.
2. This is analogous to how `xs:anySimpleType` should be handled for simple type restrictions.
