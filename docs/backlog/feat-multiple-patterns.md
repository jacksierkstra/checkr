# feat-multiple-patterns: Multiple xs:pattern facets treated as OR union

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

XSD 1.0 (§4.3.4) allows multiple `<xs:pattern>` facets on a single restriction; the value is valid if it matches **any** of them (logical OR). Currently the facet parser keeps only the first (or last) `<xs:pattern>` value, silently discarding the others.

Example:

```xml
<xs:simpleType name="ColorOrHex">
  <xs:restriction base="xs:string">
    <xs:pattern value="red|green|blue"/>
    <xs:pattern value="#[0-9A-Fa-f]{6}"/>
  </xs:restriction>
</xs:simpleType>
```

A value of `"#FF0000"` matches the second pattern and should be valid. Today only one pattern is kept, so `"#FF0000"` fails.

## Acceptance Criteria

- All `<xs:pattern>` facets from a single `<xs:restriction>` are captured.
- A value is accepted if it matches **at least one** of the collected patterns.
- A single pattern continues to work exactly as before.
- New test covers a restriction with two or more patterns.

## Implementation Hints

1. **Type change:** Change `pattern?: string` to `patterns?: string[]` on `XSDRestriction` and `XSDElement` in `src/lib/types/xsd.ts` (keeping backward-compatible accessors if needed, or migrate all call sites).
   - Alternatively, store as a pre-joined alternation: `pattern = pats.join("|")` using non-capturing groups `(?:pat1)|(?:pat2)`.
2. **Parse step:** In `src/lib/xsd/pipeline/steps/facetParser.ts`, collect all `<xs:pattern value="...">` elements into an array and join them.
3. **Validation:** `constraints.ts` and `attributes.ts` currently use the single `pattern` string — update to use the joined/array form.
