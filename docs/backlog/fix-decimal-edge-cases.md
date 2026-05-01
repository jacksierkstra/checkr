# fix-decimal-edge-cases: xs:decimal rejects valid lexical forms

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | low    |
| Status   | backlog |

## Problem

The `xs:decimal` type validator uses the regex `/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/`. Per XSD 1.0 spec §3.2.3, `xs:decimal` does **not** support scientific notation (that is `xs:float`/`xs:double`), but it **does** support:

- Leading `+` sign: `+1.5`
- No integer part: `.5` (equivalent to `0.5`)
- Multiple leading zeros: `001.23`
- Trailing zeros: `1.500`

Currently all of these are rejected.

## Acceptance Criteria

- `"+1.5"`, `"+0"`, `".5"`, `"001.23"`, `"1.500"`, `"-0.5"` are accepted as valid `xs:decimal`.
- Scientific notation forms like `"1E2"` continue to be rejected (not valid for `xs:decimal`).
- `xs:float` and `xs:double` are not affected.

## Implementation Hints

1. In `src/lib/validator/builtinTypeCheck.ts`, replace the `xs:decimal` regex with:
   ```ts
   /^[+-]?(\d+\.?\d*|\.\d+)$/
   ```
   This accepts optional leading sign, an integer part with optional decimal, or a leading-dot decimal form. No scientific notation.
2. Add unit tests in `builtinTypeCheck.test.ts` for the new valid and invalid cases.
