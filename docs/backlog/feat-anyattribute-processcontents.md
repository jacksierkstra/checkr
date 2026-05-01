# feat-anyattribute-processcontents: xs:anyAttribute processContents enforcement

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | done |

## Problem

`xs:anyAttribute` supports a `processContents` attribute (`strict`, `lax`, `skip`) just like `xs:any`. Currently `allowAnyAttribute = true` is set and no further validation is performed on wildcard attributes — equivalent to always `processContents="skip"`.

## Acceptance Criteria

- `processContents="strict"` causes an error if the wildcard attribute is not declared in any reachable schema.
- `processContents="lax"` validates the attribute if a declaration is found; skips silently otherwise.
- `processContents="skip"` retains current behaviour.

## Implementation Hints

1. **Type change:** Add `anyAttributeProcessContents?: "strict" | "lax" | "skip"` to `XSDElement` in `src/lib/types/xsd.ts`.
2. **Parse step:** In `src/lib/xsd/pipeline/steps/attributes.ts`, extract `processContents` from `<xs:anyAttribute>`.
3. **Validation step:** In `src/lib/validator/pipeline/steps/attributes.ts`, use `schema.anyAttributeProcessContents` when `schema.allowAnyAttribute` is true.
