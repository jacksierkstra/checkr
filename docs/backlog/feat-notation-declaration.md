# feat-notation-declaration: xs:notation declaration parsing

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

The `xs:NOTATION` built-in type validates that a value is a valid QName, but does not verify that the value refers to a notation that is actually declared in the schema. `<xs:notation name="..." public="..." system="..."/>` declarations are silently discarded during parsing.

Example:

```xml
<!-- XSD -->
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:notation name="jpeg" public="image/jpeg" system="view.exe"/>
  <xs:element name="image">
    <xs:complexType>
      <xs:attribute name="format" type="xs:NOTATION"/>
    </xs:complexType>
  </xs:element>
</xs:schema>

<!-- XML — should FAIL: "png" is not a declared notation -->
<image format="png"/>
```

Today both `jpeg` and `png` pass.

## Acceptance Criteria

- `<xs:notation>` declarations are parsed and stored on `XSDSchema`.
- When an attribute or element has `type="xs:NOTATION"`, its value is validated as a QName **and** checked to be in the declared notation names.
- XSD documents with no notation declarations continue to work normally.

## Implementation Hints

1. **Type change:** Add `notations?: string[]` to `XSDSchema` in `src/lib/types/xsd.ts`.
2. **Parse step:** In `src/lib/xsd/parser.ts`, extract `<xs:notation name="...">` elements from the schema root and populate `schema.notations`.
3. **Validation:** In `src/lib/validator/builtinTypeCheck.ts`, add a separate function `isValidNotationType(value, declaredNotations)` that checks both QName format and membership.
4. **Wire-up:** Pass `schema.notations` into the attribute and type validation steps (may require a step signature change or context object).
