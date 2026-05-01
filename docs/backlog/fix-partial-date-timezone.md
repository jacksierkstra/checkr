# fix-partial-date-timezone: xs:gYear etc. timezone offset range validation

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | low    |
| Status   | backlog |

## Problem

The partial date/time types (`xs:gYear`, `xs:gYearMonth`, `xs:gMonth`, `xs:gDay`, `xs:gMonthDay`) accept an optional timezone suffix via the regex pattern `(Z|[+-]\d{2}:\d{2})?`. However, the timezone offset range is not validated — values like `+25:00` or `-00:61` are accepted even though they represent invalid timezone offsets.

Per XSD 1.0 spec, timezone offsets must be in the range `−14:00` to `+14:00`.

## Acceptance Criteria

- Timezone offsets outside `±14:00` (e.g., `+25:00`, `-15:30`) are rejected.
- Valid offsets within `±14:00` continue to be accepted.
- `Z` is always accepted.
- Applies to all affected types: `xs:gYear`, `xs:gYearMonth`, `xs:gMonth`, `xs:gDay`, `xs:gMonthDay`.
- Also applies to `xs:date`, `xs:time`, `xs:dateTime` which share the same pattern.

## Implementation Hints

1. In `src/lib/validator/builtinTypeCheck.ts`, after the regex match, extract the timezone component and validate the offset range:
   ```ts
   function isValidTimezoneOffset(tz: string): boolean {
     if (tz === "Z") return true;
     const [h, m] = tz.slice(1).split(":").map(Number);
     return h < 14 || (h === 14 && m === 0);
   }
   ```
2. Apply this check in all partial date/time type cases.
