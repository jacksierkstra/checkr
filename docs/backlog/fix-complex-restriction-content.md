# fix-complex-restriction-content: xs:complexContent restriction discards children and facets

| Field    | Value    |
|----------|----------|
| Type     | bug      |
| Priority | high     |
| Status   | done     |

## Problem

When `ParseRestrictionsStep.parseComplexTypeRestriction` encounters an `xs:complexContent > xs:restriction` block, it stores only the `base` attribute and returns immediately. All child elements (`xs:sequence`, `xs:choice`, `xs:attribute`, etc.) defined inside the restriction are silently discarded.

This means schemas that tighten a base complex type via `xs:complexContent/xs:restriction` will produce wrong validation results: the restricted element is validated against the base type's structure rather than the restricted one.

Example schema:

```xml
<xs:complexType name="RestrictedAddress">
  <xs:complexContent>
    <xs:restriction base="AddressType">
      <xs:sequence>
        <xs:element name="Street" type="xs:string" minOccurs="1"/>
      </xs:sequence>
    </xs:restriction>
  </xs:complexContent>
</xs:complexType>
```

Today, the `xs:sequence` inside the restriction is dropped and `Street` is never validated as required.

## Acceptance Criteria

- Children (`xs:sequence`, `xs:choice`, `xs:all`) inside `xs:complexContent > xs:restriction` are parsed and stored.
- Attributes declared inside the restriction are parsed and stored.
- The resolved element is validated against the **restricted** structure, not the inherited base structure.
- String/pattern/length/numeric facets inside a complex restriction that also restricts a simple base are preserved.
- Co-located tests cover: restricting child elements, restricting attributes, and combined attribute + element restriction.

## Implementation Hints

1. In `ParseRestrictionsStep.parseComplexTypeRestriction`, after extracting `base`, reuse `ParseNestedElementsStep` logic (or call a shared helper) to parse child elements from the restriction node.
2. Reuse `ParseAttributesStep` to extract attributes from the restriction node.
3. Store results as `XSDRestriction.children` and `XSDRestriction.attributes` (add these fields to `XSDRestriction` in `src/lib/types/xsd.ts`).
4. In `TypeRestrictor` (resolver module), merge the restricted children/attributes onto the resolved element instead of falling back to the base type's structure.
