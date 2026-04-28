# feat-attribute-constraints: Full attribute constraint validation

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | high    |
| Status   | in-progress |

## Problem

`validateAttributes` in `src/lib/validator/pipeline/steps/attributes.ts` only type-checks `xs:integer` and `xs:boolean`. All other constraint types available on `XSDAttribute` — `xs:string`, `xs:date`, `xs:decimal`, pattern, enumeration, minLength, maxLength — are parsed but never enforced at validation time.

An attribute declared as `type="xs:date"` with a non-date value passes validation silently.

## Acceptance Criteria

- Attribute values are validated against all types supported by `validateType` for elements:
  - `xs:string` (always valid)
  - `xs:integer`, `xs:decimal`, `xs:float`, `xs:double`
  - `xs:boolean`
  - `xs:date`
- If `XSDAttribute` is extended with `pattern`, `enumeration`, `minLength`, `maxLength` fields in the future, those are also validated.
- Invalid attribute types produce `ATTRIBUTE_INVALID` errors with clear messages.
- Existing attribute tests continue to pass.

## Implementation Hints

1. **`XSDAttribute` type** (`src/lib/types/xsd.ts`): Consider adding optional `pattern`, `enumeration`, `minLength`, `maxLength` fields to `XSDAttribute` to enable richer attribute constraints. This is a type-level change only.
2. **Parsing step** (`ParseAttributesStep`): If the above fields are added to the type, update `ParseAttributesStep` to extract them from `xs:attribute > xs:simpleType > xs:restriction`.
3. **Validation** (`validateAttributes`): Extend the existing type-check switch to mirror `validateType`'s switch for elements. Extract the value-checking logic into a shared helper to avoid duplication.
4. Attribute values are always strings from the DOM — parsing to the target type (e.g., `parseInt`, `parseFloat`) is required before range checks.
