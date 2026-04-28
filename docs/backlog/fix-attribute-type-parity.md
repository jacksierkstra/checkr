# fix-attribute-type-parity: Attribute type validation covers only 4 types vs ~25 for elements

| Field    | Value    |
|----------|----------|
| Type     | bug      |
| Priority | high     |
| Status   | backlog  |

## Problem

`validateAttributes` (`src/lib/validator/pipeline/steps/attributes.ts`) calls `validateAttrType`, which only handles `xs:string`, `xs:integer`, `xs:decimal`/`xs:float`/`xs:double`, `xs:boolean`, and `xs:date`. All other types (e.g. `xs:dateTime`, `xs:token`, `xs:NCName`, unsigned integer variants, etc.) fall through to the `default: return null` branch and are silently accepted regardless of value.

The element-level `validateType` step handles ~25 built-in types correctly. The discrepancy means that attributes can hold values that would be rejected as element content, and the library returns `valid: true` when it should not.

## Acceptance Criteria

- `validateAttrType` (or a shared utility it delegates to) validates attribute values for the same set of built-in types that `validateType` validates for element content.
- Any attribute value that would be rejected as element content of the same type is also rejected as an attribute value with code `ATTRIBUTE_INVALID`.
- The fix must not duplicate the type-checking logic — extract a shared helper that both `validateType` and `validateAttrType` call.
- Existing attribute tests remain green; new tests cover at least: `xs:dateTime`, `xs:time`, `xs:token`, `xs:NCName`, `xs:positiveInteger`, `xs:nonNegativeInteger`, `xs:unsignedInt`.

## Implementation Hints

1. Extract the per-type switch logic from `validateType` into a standalone `checkBuiltinType(value: string, type: string): boolean` helper (or similar) in a shared utility file under `src/lib/validator/`.
2. Both `validateType` (element content) and `validateAttrType` (attribute values) delegate to that helper.
3. The shared helper should return `true` if the value is valid for the given type, `false` otherwise. Callers decide which `ValidationErrorCode` to use (`TYPE_MISMATCH` vs `ATTRIBUTE_INVALID`).
4. Keep numeric constraint facets (`minInclusive`, etc.) in `validateType` only — attributes do not yet support facets.
