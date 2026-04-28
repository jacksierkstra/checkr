# feat-list-type: xs:list simple type support

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

`xs:list` creates a simple type whose values are whitespace-separated sequences of another simple type's values. This construct is not parsed or validated by Checkr.

Example:

```xml
<xs:simpleType name="IntList">
  <xs:list itemType="xs:integer"/>
</xs:simpleType>

<!-- Valid XML -->
<scores>1 2 3 42</scores>

<!-- Invalid XML — "abc" is not an integer -->
<scores>1 abc 3</scores>
```

## Acceptance Criteria

- `xs:simpleType > xs:list` is parsed: the `itemType` attribute is stored.
- Element text content is split by whitespace and each token is validated against the `itemType`.
- If any token fails `itemType` validation, a `TYPE_MISMATCH` error is emitted.
- `xs:list` inside `xs:restriction` (to constrain list length) is out of scope for the initial implementation.
- A new test covers both valid and invalid list values.

## Implementation Hints

1. **Type** (`src/lib/types/xsd.ts`): Add `listItemType?: string` to `XSDElement`.
2. **Parsing:** Create `src/lib/xsd/pipeline/steps/list.ts` (`ParseListStep`) implementing `PipelineStep<Element, Partial<XSDElement>>`. Look for `xs:simpleType > xs:list` and extract `itemType` into `listItemType`.
3. **Pipeline registration:** Add `.addStep(new ParseListStep())` in `XSDPipelineParserImpl`.
4. **Validation:** In `validateType`, when `schema.listItemType` is set, split `text` on `/\s+/` and validate each token against `schema.listItemType` by constructing a minimal fake schema element and running the type check recursively.
