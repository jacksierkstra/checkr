# feat-any-processcontents: xs:any processContents enforcement

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

`xs:any` supports a `processContents` attribute with three values:

- `strict` — the matched element must be validated against its declaration in the schema.
- `lax` — validate if a declaration is found; skip silently if not.
- `skip` — no validation performed (wildcard match only).

Currently the library sets `allowAnyChild = true` when `xs:any` is present and performs no further validation on wild-card child elements. This is equivalent to always using `processContents="skip"`, regardless of the declared value.

## Acceptance Criteria

- `processContents="strict"` causes an error if the wild-card element is not declared in the schema and/or fails its declared type.
- `processContents="lax"` validates the element if a schema declaration is found; silently passes otherwise.
- `processContents="skip"` (default) retains current behaviour.
- An XSD with `<xs:any processContents="strict"/>` rejects unknown elements.

## Implementation Hints

1. **Type change:** Add `anyProcessContents?: "strict" | "lax" | "skip"` to `XSDElement` in `src/lib/types/xsd.ts`.
2. **Parse step:** In `src/lib/xsd/pipeline/steps/nestedElement.ts`, extract `processContents` from `<xs:any>` and populate the field.
3. **Validation step:** In `src/lib/validator/pipeline/steps/unexpectedElements.ts`, check `schema.anyProcessContents` when `schema.allowAnyChild` is true and apply the appropriate validation level.
