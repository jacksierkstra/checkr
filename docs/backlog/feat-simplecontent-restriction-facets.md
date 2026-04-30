# feat-simplecontent-restriction-facets: xs:simpleContent > xs:restriction facet extraction

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

`xs:simpleContent > xs:restriction` is a valid XSD 1.0 construct for deriving a new complex type (with text content and attributes) by restricting the base type's simple content. The restriction may include the same facets as a `xs:simpleType` restriction: `xs:enumeration`, `xs:pattern`, `xs:minLength`, `xs:maxLength`, `xs:length`, `xs:minInclusive`, `xs:maxInclusive`, etc.

`ParseSimpleContentStep.parseRestriction()` currently extracts only the `base` type name and any `xs:attribute` children. All restriction facets are silently discarded. A document that violates an enumeration or pattern defined in `xs:simpleContent > xs:restriction` is accepted as valid.

## Acceptance Criteria

- Facets declared inside `xs:simpleContent > xs:restriction` are extracted and stored on the element schema (same fields used for `xs:simpleType` restriction: `enumeration`, `pattern`, `minLength`, `maxLength`, `length`, `minInclusive`, `maxInclusive`, `minExclusive`, `maxExclusive`, `totalDigits`, `fractionDigits`, `whiteSpace`).
- The existing node-level validation pipeline applies those facets when validating the element's text content.
- Attributes declared in the restriction are correctly merged (already partially working).
- Co-located tests cover: simpleContent restriction with enumeration; simpleContent restriction with pattern; simpleContent restriction with length facet; valid value passes.

## Implementation Hints

1. **Parsing (`ParseSimpleContentStep.parseRestriction`):** After extracting `base` and attributes, call the same facet-extraction helpers used in `ParseRestrictionsStep.parseBasicRestrictionFacets` and `extractNumericFacets`. Spread the results onto the returned `Partial<XSDElement>`.
2. **No new validation steps needed**: once the facets are stored in the standard fields (`enumeration`, `pattern`, `minLength`, etc.), the existing node pipeline (`validatePattern`, `validateConstraints`, etc.) will pick them up automatically.
3. **Shared helper**: Consider extracting a `parseRestrictionFacets(restriction: Element): Partial<XSDElement>` utility shared between `ParseRestrictionsStep` and `ParseSimpleContentStep` to avoid duplication.
