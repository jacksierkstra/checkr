# feat-nillable: xs:nillable + xsi:nil support

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | low     |
| Status   | backlog |

## Problem

In XSD, an element declared with `nillable="true"` may appear in the XML with `xsi:nil="true"` to explicitly signal a null/absent value. When `xsi:nil="true"` is present, the element must have no content and type/content validation should be skipped.

Checkr currently ignores `nillable` and `xsi:nil`, so:
- A nil element with `xsi:nil="true"` but no text content may fail type validation (e.g., an `xs:integer` element with empty text).
- A non-nil element cannot be distinguished from a nil one.

## Acceptance Criteria

- `nillable="true"` on an `xs:element` declaration is parsed and stored.
- At validation time, if a node has `xsi:nil="true"`, type and content validation is skipped for that node.
- If a node has `xsi:nil="true"` but its schema element is not `nillable`, a `TYPE_MISMATCH` or new `NIL_NOT_ALLOWED` error is emitted.
- A nil element that has text content or child elements (violating the nil contract) emits an error.
- Existing tests are unaffected.

## Implementation Hints

1. **Type** (`src/lib/types/xsd.ts`): Add `nillable?: boolean` to `XSDElement`.
2. **Parsing:** `ParseRootElementStep` already reads `abstract`; similarly read `nillable="true"` from the element and set `nillable: true` on the partial.
3. **Validation:** At the top of `validateType` (and `validateRequiredChildren`), check if `node.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "nil") === "true"`. If so:
   - If `schema.nillable` is true, return `[]` (skip all content checks).
   - If `schema.nillable` is false/undefined, emit an error.
4. **Error code:** Consider adding `NIL_NOT_ALLOWED` to `ValidationErrorCode` in `validation.ts`.
