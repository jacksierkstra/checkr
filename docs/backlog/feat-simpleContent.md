# feat-simpleContent: xs:simpleContent parsing and validation

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | high    |
| Status   | in-progress |

## Problem

`xs:simpleContent` is a very common XSD construct that allows a complex type to have typed text content **plus** attributes. No pipeline step currently parses this structure, so schemas using `xs:simpleContent` are silently ignored.

Example:

```xml
<xs:complexType name="PriceType">
  <xs:simpleContent>
    <xs:extension base="xs:decimal">
      <xs:attribute name="currency" type="xs:string" use="required"/>
    </xs:extension>
  </xs:simpleContent>
</xs:complexType>
```

An element typed as `PriceType` should:
- Validate its text content as `xs:decimal`
- Require the `currency` attribute

Neither check happens today.

## Acceptance Criteria

- `xs:simpleContent/xs:extension` is parsed: the base type is extracted as the element's `type`, and attributes are extracted.
- `xs:simpleContent/xs:restriction` is parsed: base type + narrowed facets are extracted.
- Validation enforces the base type on element text content and validates attributes as usual.
- Existing `xs:complexContent` tests are unaffected.
- Co-located test file covers both extension and restriction variants.

## Implementation Hints

1. **Type (`src/lib/types/xsd.ts`):** No new fields required — `type`, `attributes`, and existing restriction/extension fields cover this.
2. **Parsing step:** Create `src/lib/xsd/pipeline/steps/simpleContent.ts` implementing `PipelineStep<Element, Partial<XSDElement>>`. Look for `xs:complexType > xs:simpleContent > xs:extension` or `xs:restriction`. Extract `base` as `type` and delegate attribute parsing to `ParseAttributesStep`.
3. **Pipeline registration:** Add `.addStep(new ParseSimpleContentStep())` in `XSDPipelineParserImpl`. Ensure step ownership: `ParseSimpleContentStep` owns the `type` field only for elements that have simpleContent — check for a `simpleContent` child before returning anything.
4. **Validation:** No new validation step needed — `validateType` and `validateAttributes` already handle the extracted fields.
5. **Resolver:** `TypeExtender` handles `xs:extension` base resolution; reuse that path by populating `extension.base` or directly setting `type` so the resolver resolves the base type.
