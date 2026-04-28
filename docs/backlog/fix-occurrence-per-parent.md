# fix-occurrence-per-parent: Occurrence counting is document-global, not per-parent

| Field    | Value    |
|----------|----------|
| Type     | bug      |
| Priority | critical |
| Status   | backlog  |

## Problem

`validateOccurrence` in `src/lib/validator/pipeline/steps/occurence.ts` receives an array of all matching nodes collected via `xmlDoc.getElementsByTagName(schemaElement.name)` in `ValidatorImpl.validateElements`. This counts **every occurrence in the entire document** rather than occurrences within the element's parent.

Consider a schema where `<person>` can repeat and each `<person>` has exactly one `<name>`. If the document has five `<person>` elements, occurrence checking sees 5 `<name>` elements globally, which may exceed or fall short of the per-instance `minOccurs`/`maxOccurs` for a specific parent — producing false violations.

**Affected file:** `src/lib/validator/validator.ts` → `validateElements()` and `validateNode()`

## Acceptance Criteria

- Occurrence of a child element is counted within its direct parent node, not across the whole document.
- A document with `<root><item/><item/></root>` and `maxOccurs="2"` on `<item>` passes.
- A document with `<a><item/></a><b><item/></b>` and `maxOccurs="1"` on `<item>` passes (each parent has only 1).
- A document with `<root><item/><item/><item/></root>` and `maxOccurs="2"` fails with `OCCURRENCE_VIOLATION`.
- Existing occurrence tests continue to pass.

## Implementation Hints

1. In `ValidatorImpl.validateNode`, when recursing over `schemaElement.children`, pass the already-filtered child element list for each `childSchema` into `globalPipeline.execute(filtered, childSchema)` — this already happens, so the fix is ensuring `validateElements` at the top level only passes root-level nodes.
2. The root-level call `this.validateElements(xmlDoc, schema.elements)` correctly finds top-level elements; the issue is that `validateOccurrence` fires again inside `validateNode` for children using counts from `xmlDoc`. Trace the call sites and ensure occurrence is only checked against the scoped filtered list, not a fresh document-level query.
3. No changes to the `validateOccurrence` function signature itself are needed — it accepts a pre-filtered node list.
