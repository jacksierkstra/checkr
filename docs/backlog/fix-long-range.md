# fix-long-range: `xs:long` and `xs:unsignedLong` missing range bounds

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | low    |
| Status   | done    |

## Problem

In `src/lib/validator/builtinTypeCheck.ts`, the `xs:long` and `xs:unsignedLong` cases only validate the lexical pattern, not the value range mandated by XSD 1.0:

```ts
case "xs:long":
  return /^-?\d+$/.test(value);   // ← no range check
case "xs:unsignedLong":
  return /^\d+$/.test(value);     // ← no upper-bound check
```

Per XSD 1.0:
- `xs:long` value space: −9,223,372,036,854,775,808 to 9,223,372,036,854,775,807 (64-bit signed)
- `xs:unsignedLong` value space: 0 to 18,446,744,073,709,551,615 (64-bit unsigned)

JavaScript's `Number` type cannot represent these ranges exactly (safe-integer limit is ±2⁵³ − 1 ≈ 9×10¹⁵). Naïve use of `parseInt` or `Number()` silently loses precision for values near the 64-bit boundary.

## Acceptance Criteria

- `xs:long` rejects values outside −9,223,372,036,854,775,808 to 9,223,372,036,854,775,807 (must compare as `BigInt`).
- `xs:unsignedLong` rejects values above 18,446,744,073,709,551,615 (must compare as `BigInt`).
- Values inside the range continue to pass.
- Values that are valid integers but outside the range return `false` from `isValidBuiltinType`.
- No changes to any other case in `builtinTypeCheck.ts`.

## Implementation Hints

1. Use `BigInt(value)` inside a `try/catch` (or `BigInt(parseInt(…))`) for comparison. `BigInt` is available in all environments supporting Node.js 18+ and modern browsers, which are Checkr's minimum targets.
2. Guard with the existing integer pattern check first, then do the `BigInt` comparison:
   ```ts
   case "xs:long": {
     if (!/^-?\d+$/.test(value)) return false;
     const n = BigInt(value);
     return n >= -9223372036854775808n && n <= 9223372036854775807n;
   }
   case "xs:unsignedLong": {
     if (!/^\d+$/.test(value)) return false;
     const n = BigInt(value);
     return n <= 18446744073709551615n;
   }
   ```
3. Add co-located tests in `builtinTypeCheck.test.ts` covering boundary values (exactly at min/max, one outside each boundary).
