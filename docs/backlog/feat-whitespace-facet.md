# feat-whitespace-facet: xs:whiteSpace restriction facet

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | done    |

## Problem

The `xs:whiteSpace` restriction facet controls how whitespace in an element's text content is normalised before validation. The three legal values are:

- `preserve` — no normalisation (default for `xs:string`)
- `replace` — replace each `\t`, `\n`, `\r` with a single space
- `collapse` — replace runs of whitespace with a single space and strip leading/trailing whitespace

Checkr currently ignores `xs:whiteSpace` entirely: it is not parsed by `ParseRestrictionsStep` and is not enforced during validation. This means a schema declaring `<xs:whiteSpace value="collapse"/>` has no effect, which can cause `xs:pattern` and `xs:length` facets to produce false positives when the raw text contains padding whitespace.

## Acceptance Criteria

- `xs:whiteSpace` is parsed by `ParseRestrictionsStep` and stored (e.g., add a `whiteSpace?: "preserve" | "replace" | "collapse"` field to `XSDRestriction` and/or `XSDElement`).
- Before applying `xs:pattern`, `xs:minLength`, `xs:maxLength`, and `xs:length` facets, the `validateType` step normalises the text content according to the `whiteSpace` value.
- `preserve` leaves the value untouched; `replace` replaces each `\t`/`\n`/`\r` with a space; `collapse` collapses and trims.
- Co-located tests cover all three modes and confirm that patterns and length checks operate on the normalised value.

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Add `whiteSpace?: "preserve" | "replace" | "collapse"` to `XSDRestriction` and to `XSDElement`.
2. **Parsing (`src/lib/xsd/pipeline/steps/restriction.ts`):** In `extractFacets`, add detection of `<xs:whiteSpace value="..."/>` and populate the field.
3. **Validation (`src/lib/validator/pipeline/steps/type.ts`):** Extract a `normaliseWhiteSpace(text, mode)` helper and call it before using `text` in pattern/length checks. Default to `preserve` if no `whiteSpace` is specified.
4. No new pipeline step is needed — all changes fit into existing parsing and validation steps.
