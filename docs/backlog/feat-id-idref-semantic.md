# feat-id-idref-semantic: xs:ID uniqueness and xs:IDREF referential integrity

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | high    |
| Status   | done |

## Problem

`builtinTypeCheck.ts` validates `xs:ID`, `xs:IDREF`, and `xs:IDREFS` only lexically (name format). XSD 1.0 requires two additional semantic rules that are not currently enforced:

1. **`xs:ID` uniqueness**: All values of type `xs:ID` within a document must be unique. A duplicate ID is a validity error.
2. **`xs:IDREF` / `xs:IDREFS` referential integrity**: Each value of type `xs:IDREF` (or each space-separated token in `xs:IDREFS`) must match the value of some `xs:ID`-typed attribute or element in the same document.

These are document-level constraints that cannot be checked on a single node in isolation.

## Acceptance Criteria

- A document with two elements/attributes sharing the same `xs:ID` value produces a validation error with a new code `"DUPLICATE_ID"`.
- A document with an `xs:IDREF` value that does not match any `xs:ID` value in the document produces a validation error with a new code `"UNRESOLVED_IDREF"`.
- `xs:IDREFS`: each individual token is checked; one unresolved token produces one error per unresolved token.
- Lexical checks (existing format validation) still run first; semantic checks only apply to lexically valid values.
- Co-located tests cover: duplicate ID (error); valid IDREF (ok); unresolved IDREF (error); valid IDREFS (ok); mixed valid/invalid IDREFS.

## Implementation Hints

1. **`ValidationErrorCode`:** Add `"DUPLICATE_ID"` and `"UNRESOLVED_IDREF"` to the union in `src/lib/types/validation.ts`.
2. **Document-level validation function:** Add `validateIdSemantics(xmlDoc: XMLDocument, schema: XSDSchema): ValidationError[]` in the validator. This function walks the entire XML document, identifies all elements/attributes whose schema type is `xs:ID`, collects their values, then makes a second pass for `xs:IDREF`/`xs:IDREFS`.
3. **Schema type lookup:** To know whether a given element/attribute has type `xs:ID`, the function needs access to the resolved schema. Walk the schema tree alongside the XML tree, using the same element-matching logic as `ValidatorImpl`.
4. **Integration:** Call `validateIdSemantics` from `ValidatorImpl.validate()` after the per-node pipeline completes, alongside the existing `validateRootElements` document-level call.
5. **Attribute types:** ID/IDREF most commonly appear as attribute types. Ensure attribute schema lookup is included in the walk.
