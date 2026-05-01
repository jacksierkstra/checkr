# feat-complexcontent-mixed: xs:complexContent mixed attribute override

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | low     |
| Status   | backlog |

## Problem

In XSD 1.0, the `mixed` attribute can appear on both `<xs:complexType>` and `<xs:complexContent>`. When present on `<xs:complexContent>`, it overrides the value from the parent `<xs:complexType>`. Currently, the `mixed` attribute on `<xs:complexContent>` itself is not parsed — only `mixed` on `<xs:complexType>` is captured.

Example:

```xml
<!-- xs:complexType does NOT declare mixed, but xs:complexContent does -->
<xs:complexType name="MixedDerived">
  <xs:complexContent mixed="true">
    <xs:extension base="BaseType">
      <xs:sequence>
        <xs:element name="child" type="xs:string"/>
      </xs:sequence>
    </xs:extension>
  </xs:complexContent>
</xs:complexType>
```

The resulting element should allow mixed content (text nodes interleaved with child elements), but today `mixed` is `false`.

## Acceptance Criteria

- When `<xs:complexContent mixed="true">` is present, the resulting `XSDElement.mixed` is `true`.
- When `<xs:complexContent mixed="false">` is present on a complexType that has `mixed="true"`, the result is `mixed = false`.
- Existing `mixed` tests continue to pass.

## Implementation Hints

1. In `src/lib/xsd/pipeline/steps/extension.ts`, when parsing `<xs:complexContent>`, read the `mixed` attribute from the `complexContent` DOM element and return it as part of the `Partial<XSDElement>`.
2. Same change needed in `src/lib/xsd/pipeline/steps/restriction.ts` for the restriction variant.
3. The `ElementAssembler` merges step results; the `mixed` value from the complexContent step will override any earlier value.
