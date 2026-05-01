# feat-type-final-block: final/block on named xs:complexType propagation

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

`block` and `final` attributes can appear on both `<xs:element>` and on named `<xs:complexType>` declarations. Currently, `block`/`final` are parsed and enforced on element declarations but **not** on named type declarations. When an element references a named type that has `final="extension"`, the restriction is not propagated.

Example:

```xml
<!-- XSD -->
<xs:complexType name="BaseType" final="extension">
  <xs:sequence>
    <xs:element name="value" type="xs:string"/>
  </xs:sequence>
</xs:complexType>

<!-- Derived type extending BaseType — should be INVALID because BaseType has final="extension" -->
<xs:complexType name="DerivedType">
  <xs:complexContent>
    <xs:extension base="BaseType">
      <xs:sequence>
        <xs:element name="extra" type="xs:string"/>
      </xs:sequence>
    </xs:extension>
  </xs:complexContent>
</xs:complexType>
```

Today no error is reported.

## Acceptance Criteria

- `final="extension"` on a named `xs:complexType` prevents any type from extending it; a `DERIVATION_BLOCKED` error is produced.
- `final="restriction"` prevents restriction derivation.
- `final="#all"` prevents all derivation.
- `block` on a named type prevents substitution/extension/restriction in instance documents.
- Existing `block`/`final` tests on element-level declarations continue to pass.

## Implementation Hints

1. **Schema storage:** Add `final?` and `block?` to the objects stored in `XSDSchema.types` (they are already part of `XSDElement`).
2. **Parse step:** In the XSD parser, when storing global complexType declarations, preserve their `final` and `block` attributes.
3. **Resolver:** In `src/lib/xsd/resolvers/modules/TypeExtender.ts` and `TypeRestrictor.ts`, after resolving the base type, check whether `baseType.final` blocks the requested derivation kind and throw or return an appropriate error.
4. **Validation step:** `validateDerivationBlocked` may need to be extended to also check type-level `final` when an element references a named type.
