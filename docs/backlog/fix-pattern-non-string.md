# fix-pattern-non-string: Pattern facet applied only to xs:string type

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | medium |
| Status   | backlog |

## Problem

In `src/lib/validator/pipeline/steps/constraints.ts`, pattern matching is guarded by a check for `schema.type === "xs:string"` (or similar string-type check). Per XSD 1.0 spec §4.3.4, `xs:pattern` is applicable to **all** simple types, not just strings.

Example — pattern on an integer type:

```xml
<!-- XSD: exactly 5 digits -->
<xs:simpleType name="ZipCode">
  <xs:restriction base="xs:integer">
    <xs:pattern value="\d{5}"/>
  </xs:restriction>
</xs:simpleType>
<xs:element name="zip" type="ZipCode"/>
```

```xml
<!-- XML — should FAIL: "1234" does not match \d{5} -->
<zip>1234</zip>
```

Today the pattern check is skipped because the base type is `xs:integer`, not `xs:string`.

## Acceptance Criteria

- `xs:pattern` is validated regardless of base type (integer, decimal, date, etc.).
- The pattern is matched against the **lexical representation** of the value (the text content as-is, after whitespace normalisation).
- Existing pattern tests for string types continue to pass.
- New test covers pattern on `xs:integer`, `xs:date`, and other non-string types.

## Implementation Hints

1. In `src/lib/validator/pipeline/steps/constraints.ts`, remove or widen the type guard that restricts pattern checks to string types.
2. The pattern facet should be applied after whitespace normalisation (consistent with how the `whiteSpace` facet works) but before any type-specific conversion.
3. Check both `schema.pattern` and `schema.restriction?.pattern`.
