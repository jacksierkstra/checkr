# feat-missing-builtin-types: Missing xs: built-in type checks (binary, date-partial, misc)

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

`validateType` in `src/lib/validator/pipeline/steps/type.ts` falls through to `default: break` for a number of standard XSD built-in types, silently accepting any value without checking format. The missing types are:

| Type | Expected format |
|---|---|
| `xs:duration` | ISO 8601 duration, e.g. `P1Y2M3DT4H5M6S` |
| `xs:gYear` | `YYYY` or `YYYY+offset` |
| `xs:gYearMonth` | `YYYY-MM` |
| `xs:gMonth` | `--MM` |
| `xs:gDay` | `---DD` |
| `xs:gMonthDay` | `--MM-DD` |
| `xs:hexBinary` | Even-length hex string `[0-9A-Fa-f]*` |
| `xs:base64Binary` | Valid Base64 characters with optional whitespace |
| `xs:Name` | XML Name token (starts with letter/underscore/colon) |
| `xs:language` | RFC 1766 language tag e.g. `en`, `en-GB` |
| `xs:NMTOKENS` | Space-separated list of NMTOKEN values |

`xs:ID`, `xs:IDREF`, `xs:IDREFS`, `xs:ENTITY`, `xs:ENTITIES`, `xs:NOTATION`, `xs:anyType`, and `xs:anySimpleType` are **not** in scope for this item — they require cross-element identity passes or architectural changes.

## Acceptance Criteria

- Each type listed in the table above is handled in the `validateType` switch with an appropriate regex or format check.
- An invalid value produces a `TYPE_MISMATCH` error with `element`, `expected` (the type name), and `actual` (the value) populated.
- Valid values produce no error.
- Co-located tests cover at least one valid and one invalid value for each new type.

## Implementation Hints

1. All changes go inside the `switch (schema.type)` block in `src/lib/validator/pipeline/steps/type.ts`.
2. Use simple regexes; do not attempt full ISO 8601 parser — a well-formed pattern check is sufficient.
3. `xs:NMTOKENS`: split on whitespace and validate each token against the existing `xs:NMTOKEN` regex.
4. `xs:Name`: similar to `xs:NCName` but allows a leading colon — regex `^[a-zA-Z_:][\w.:-]*$`.
5. `xs:language`: regex `^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$`.
