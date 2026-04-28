# feat-mixed-content: Validate xs:complexType mixed="true" content model

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | low     |
| Status   | backlog |

## Problem

XSD `mixed="true"` on `xs:complexType` means an element may contain interleaved text and child elements. Checkr parses and stores this flag (`XSDElement.mixed = true`) but does not use it during validation.

The consequence is that a complex element with `mixed="false"` (the default) that contains unexpected text content passes without error, and an element with `mixed="true"` may produce spurious errors from validators that do not account for text nodes.

## Acceptance Criteria

- When `schema.mixed` is explicitly `false` (or absent/default) and an element contains non-whitespace text alongside child elements, a validation error is raised (code `TYPE_MISMATCH` or a new `MIXED_CONTENT_VIOLATION`).
- When `schema.mixed` is `true`, interleaved text nodes do not cause errors.
- Co-located tests cover: mixed=true with text and children; mixed=false (default) with text content rejected.

## Implementation Hints

1. Add a `validateMixedContent` node-level step in `src/lib/validator/pipeline/steps/`.
2. The step checks `node.childNodes` for `TEXT_NODE` (type 3) children with non-whitespace content.
3. If `schema.mixed !== true` and such text nodes exist alongside element children, return an error.
4. Register the step in `ValidatorImpl`'s `nodePipeline`.
5. Consider whether a new `ValidationErrorCode` (`MIXED_CONTENT_VIOLATION`) is warranted or whether `TYPE_MISMATCH` is sufficient. If adding a new code, update `src/lib/types/validation.ts`.
