# fix-date-timezone: xs:date missing optional timezone suffix

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | low    |
| Status   | backlog |

## Problem

Per XSD 1.0 spec §3.2.9, `xs:date` values may carry an optional timezone designator: `Z`, `+hh:mm`, or `-hh:mm`. The current regex `/^\d{4}-\d{2}-\d{2}$/` rejects any timezone-qualified date.

Examples that are valid per spec but currently rejected:

- `"2024-01-15Z"` (UTC)
- `"2024-01-15+05:30"` (IST)
- `"2024-01-15-08:00"` (PST)

## Acceptance Criteria

- `xs:date` values with a valid timezone suffix are accepted.
- Dates without a timezone suffix continue to be accepted.
- Invalid forms (e.g., `"2024-1-5"`, `"2024-13-01"`) continue to be rejected.

## Implementation Hints

1. In `src/lib/validator/builtinTypeCheck.ts`, update the `xs:date` regex:
   ```ts
   /^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/
   ```
2. Add unit tests for timezone-qualified and unqualified dates.
