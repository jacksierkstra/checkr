# feat-sequence-order: Enforce xs:sequence child element ordering

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | high    |
| Status   | in-progress |

## Problem

`validateRequiredChildren` checks that required child elements are **present**, but not that they appear in the **order** declared by `xs:sequence`. A document with children in the wrong order passes validation.

Example — schema requires `<first>` then `<second>`:

```xml
<!-- XSD -->
<xs:complexType name="PairType">
  <xs:sequence>
    <xs:element name="first" type="xs:string"/>
    <xs:element name="second" type="xs:string"/>
  </xs:sequence>
</xs:complexType>

<!-- XML — should FAIL (wrong order) -->
<pair>
  <second>B</second>
  <first>A</first>
</pair>
```

Today this passes validation.

## Acceptance Criteria

- Children appearing in the wrong order relative to `schema.children` produce a `MISSING_REQUIRED_ELEMENT` or a new `SEQUENCE_VIOLATION` error code.
- Optional children (`minOccurs="0"`) that are absent do not affect the order check of the remaining children.
- `xs:choice` children are not subject to ordering (order is irrelevant for choices).
- Existing sequence tests continue to pass.

## Implementation Hints

1. **Error code:** Consider adding `SEQUENCE_VIOLATION` to `ValidationErrorCode` in `src/lib/types/validation.ts` for a more specific signal.
2. **Validation step:** Create `src/lib/validator/pipeline/steps/sequenceOrder.ts` implementing `NodeValidationStep`. Walk `schema.children` and find each child's actual DOM position. Detect out-of-order occurrences.
3. **Algorithm sketch:** For each pair of consecutive required schema children A and B, find the last occurrence of A in the XML children and the first occurrence of B. If B appears before A, emit an error.
4. **Registration:** Add `validateSequenceOrder` to `ValidatorImpl`'s `nodePipeline`.
5. The current `XSDElement` does not distinguish between sequence and non-sequence children. A `sequenced?: boolean` flag may be needed on `XSDElement` or its children list so the step knows when to apply ordering.
