# feat-missing-id-types: Lexical validation for xs:QName, xs:ID, xs:IDREF, xs:IDREFS, xs:ENTITY, xs:ENTITIES, xs:NOTATION

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

`builtinTypeCheck.ts` implements lexical format checks for ~35 XSD built-in types, but several XSD 1.0 primitive and derived types are absent:

| Type | Description |
|------|-------------|
| `xs:QName` | Qualified name: optional `prefix:` followed by an NCName |
| `xs:ID` | An NCName that must be unique within the document |
| `xs:IDREF` | An NCName that must reference an existing `xs:ID` |
| `xs:IDREFS` | Whitespace-separated list of `xs:IDREF` values |
| `xs:ENTITY` | An NCName matching an unparsed entity in the DTD |
| `xs:ENTITIES` | Whitespace-separated list of `xs:ENTITY` values |
| `xs:NOTATION` | A QName matching a notation declared in the DTD |

Because `isValidBuiltinType` falls through to `default: return true` for unknown types, documents with values that violate the lexical format of these types pass validation silently.

> **Important scope boundary:** This item covers **lexical format validation only**. Structural constraints — `xs:ID` uniqueness within a document, `xs:IDREF` referential integrity to an existing `xs:ID`, `xs:ENTITY`/`xs:NOTATION` declarations in a DTD — require a separate multi-pass identity validation architecture and are explicitly **out of scope** here. Those concerns should be addressed in a separate backlog item once the architecture supports it.

## Acceptance Criteria

- `isValidBuiltinType` returns the correct result for the following types:
  - `xs:QName`: optional `NCName:` prefix followed by a valid NCName (`/^([a-zA-Z_][\w.-]*:)?[a-zA-Z_][\w.-]*$/`)
  - `xs:ID`: same lexical form as `xs:NCName`
  - `xs:IDREF`: same lexical form as `xs:NCName`
  - `xs:IDREFS`: whitespace-separated, each token a valid `xs:IDREF`; at least one token required
  - `xs:ENTITY`: same lexical form as `xs:NCName`
  - `xs:ENTITIES`: whitespace-separated, each token a valid `xs:ENTITY`; at least one token required
  - `xs:NOTATION`: same lexical form as `xs:QName`
- Co-located tests in `builtinTypeCheck.test.ts` cover valid and invalid values for each type.
- No new `ValidationErrorCode` values are needed; existing `TYPE_MISMATCH` applies.

## Implementation Hints

1. **File:** `src/lib/validator/builtinTypeCheck.ts` — add `case` branches inside the existing `switch` statement.
2. **`xs:QName`:** `return /^([a-zA-Z_][\w.-]*:)?[a-zA-Z_][\w.-]*$/.test(value);`
3. **`xs:ID` / `xs:IDREF` / `xs:ENTITY`:** Reuse the existing `xs:NCName` regex pattern.
4. **`xs:IDREFS` / `xs:ENTITIES`:** Split on `/\s+/`, check each token, require at least one token.
5. **`xs:NOTATION`:** Reuse the `xs:QName` regex pattern.
6. Tests go in the existing `src/lib/validator/builtinTypeCheck.test.ts`.
