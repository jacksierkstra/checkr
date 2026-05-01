# fix-duration-completeness: xs:duration edge-case validation

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | low    |
| Status   | backlog |

## Problem

The `xs:duration` regex is strict but may reject or incorrectly accept some edge cases per XSD 1.0 spec §3.2.6:

- The spec requires at least one duration field to be present after `P`.
- The time designator `T` must be followed by at least one time field.
- Fractional digits are only allowed on the seconds component.
- Very large values (e.g., many-digit year counts) should be accepted.

Current regex: `/^-?P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/`

The existing guard `value !== "P" && value !== "-P"` catches the bare `P` case, but `"PT"` (T with no time fields) may pass incorrectly.

## Acceptance Criteria

- `"PT"` is rejected (T must have at least one following field).
- `"P"` and `"-P"` are rejected (already handled).
- `"P1Y"`, `"PT1H"`, `"P1Y2M3DT4H5M6.789S"` are accepted.
- Fractional values on non-seconds fields (`"P1.5Y"`) are rejected.

## Implementation Hints

1. In `src/lib/validator/builtinTypeCheck.ts`, strengthen the xs:duration validation:
   - After the regex test, add a guard: `!value.endsWith("T")`.
   - Or use a revised regex that makes at least one field mandatory and disallows bare T.
2. Add unit tests for the edge cases above.
