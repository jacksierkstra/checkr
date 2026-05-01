# fix-float-double-special: xs:float and xs:double missing INF/-INF/NaN

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | low    |
| Status   | backlog |

## Problem

Per XSD 1.0 spec §3.2.4–3.2.5, `xs:float` and `xs:double` must accept the IEEE 754 special values `INF`, `-INF`, and `NaN` (case-sensitive). The current regex `/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/` rejects all three.

Additionally, the regex rejects a leading `+` sign on numeric values (e.g., `+3.14`) which is valid for both types.

## Acceptance Criteria

- `"INF"`, `"-INF"`, `"NaN"` are valid for both `xs:float` and `xs:double`.
- `"+3.14"`, `"+1E10"` are accepted (positive sign is valid).
- `"inf"`, `"nan"` (lowercase) are correctly rejected (case-sensitive per spec).
- Other invalid strings continue to be rejected.

## Implementation Hints

1. In `src/lib/validator/builtinTypeCheck.ts`, update the `xs:float` and `xs:double` cases:
   ```ts
   case "xs:float":
   case "xs:double":
     return value === "INF" || value === "-INF" || value === "NaN"
       || /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)
       || /^[+-]?\.\d+([eE][+-]?\d+)?$/.test(value);
   ```
2. Add unit tests in `builtinTypeCheck.test.ts`.
