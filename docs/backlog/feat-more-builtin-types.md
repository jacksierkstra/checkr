# feat-more-builtin-types: Additional xs: built-in type checks

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | done |

## Problem

`validateType` in `src/lib/validator/pipeline/steps/type.ts` handles only `xs:string`, `xs:integer`, `xs:decimal`, `xs:float`, `xs:double`, `xs:boolean`, and `xs:date`. All other XSD built-in primitive and derived types fall through to the `default` case and are silently accepted with any value.

Missing types include:

| Type | Constraint |
|------|------------|
| `xs:dateTime` | ISO 8601 datetime, e.g. `2023-01-01T12:00:00` |
| `xs:time` | ISO 8601 time, e.g. `12:00:00` |
| `xs:long` | 64-bit integer (`-9223372036854775808` to `9223372036854775807`) |
| `xs:int` | 32-bit integer (`-2147483648` to `2147483647`) |
| `xs:short` | 16-bit integer (`-32768` to `32767`) |
| `xs:byte` | 8-bit integer (`-128` to `127`) |
| `xs:unsignedLong` / `xs:unsignedInt` / `xs:unsignedShort` / `xs:unsignedByte` | Non-negative bounded integers |
| `xs:nonNegativeInteger` | `>= 0` |
| `xs:positiveInteger` | `> 0` |
| `xs:negativeInteger` | `< 0` |
| `xs:nonPositiveInteger` | `<= 0` |
| `xs:anyURI` | Any URI (lenient: non-empty string) |
| `xs:token` | Whitespace-collapsed string |
| `xs:normalizedString` | No CR, LF, or tab |
| `xs:NMTOKEN` | XML name token pattern |
| `xs:NCName` | Non-colonised XML name |

## Acceptance Criteria

- Each type in the table above has a corresponding check in `validateType`.
- Invalid values for those types produce a `TYPE_MISMATCH` error.
- Valid values pass without error.
- A test suite covers each new type with at least one valid and one invalid value.

## Implementation Hints

1. Extend the `switch` block in `validateType`. Group logically: datetime types together, bounded integers together, string-derived types together.
2. For bounded integers, validate with `Number.isInteger` and range checks.
3. For `xs:normalizedString`, check that `\r`, `\n`, `\t` are absent.
4. For `xs:token`, verify no leading/trailing whitespace and no internal sequences of multiple spaces (or use a single regex).
5. For `xs:NMTOKEN` / `xs:NCName`, use the XML spec regex: `[a-zA-Z_][\w.-]*` (NCName) and `[\w.-:]+` (NMTOKEN).
