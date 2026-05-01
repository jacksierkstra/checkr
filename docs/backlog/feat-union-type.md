# feat-union-type: xs:union simple type support

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | done    |

> **Note:** This item covers the `memberTypes=` attribute form of `xs:union`. Inline `<xs:simpleType>` children inside `<xs:union>` are tracked separately in [feat-union-inline-members](./feat-union-inline-members.md).

## Problem

`xs:union` defines a simple type as the union of two or more member types — a value is valid if it satisfies **any one** of the member types. This construct is not parsed or validated by Checkr.

Example:

```xml
<xs:simpleType name="IntOrString">
  <xs:union memberTypes="xs:integer xs:string"/>
</xs:simpleType>
```

## Acceptance Criteria

- `xs:simpleType > xs:union` is parsed: the `memberTypes` attribute is split into a list of type names and stored.
- Element text content is validated as valid if it passes type validation for **at least one** member type.
- If no member type matches, a `TYPE_MISMATCH` error is emitted naming the union.
- Inline member type definitions (anonymous simpleTypes inside `xs:union`) are out of scope for the initial implementation.
- A new test covers single-match, multi-match, and no-match scenarios.

## Implementation Hints

1. **Type** (`src/lib/types/xsd.ts`): Add `unionMemberTypes?: string[]` to `XSDElement`.
2. **Parsing:** Create `src/lib/xsd/pipeline/steps/union.ts` (`ParseUnionStep`) implementing `PipelineStep<Element, Partial<XSDElement>>`. Look for `xs:simpleType > xs:union`, split `memberTypes` on whitespace, store in `unionMemberTypes`.
3. **Pipeline registration:** Add `.addStep(new ParseUnionStep())` in `XSDPipelineParserImpl`.
4. **Validation:** In `validateType`, when `schema.unionMemberTypes` is set, iterate over member types. For each, construct a minimal schema element with `type = memberType` and run the existing type switch. If any succeeds (no errors), the value is valid.
5. **Resolver:** If member types are named custom types, they need to be resolved. Consider adding a `UnionResolver` module following the resolver module pattern from `src/lib/xsd/resolvers/modules/interfaces.ts`.
