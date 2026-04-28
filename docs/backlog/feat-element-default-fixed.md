# feat-element-default-fixed: xs:default and xs:fixed on xs:element

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | low     |
| Status   | backlog |

## Problem

XSD allows `xs:element` declarations to carry `default` and `fixed` attributes, which provide a default value when the element is absent and constrain the element to a specific value respectively:

```xml
<xs:element name="Status" type="xs:string" default="active"/>
<xs:element name="Version" type="xs:string" fixed="1.0"/>
```

Today, `ParseNestedElementsStep` and `ParseRootElementStep` do not read these attributes, so neither value is stored or validated. `xs:default`/`xs:fixed` on `xs:attribute` are already implemented and can serve as the reference implementation.

## Acceptance Criteria

- `default` and `fixed` attributes on `xs:element` are parsed and stored in `XSDElement` (add `default?: string` and `fixed?: string` fields to the interface).
- During validation, if an element is absent and a `default` is defined, no `MISSING_REQUIRED_ELEMENT` error is raised (treat the element as present with the default value).
- If a `fixed` value is defined and the element is present with a different text content, a `TYPE_MISMATCH` (or `ATTRIBUTE_INVALID`-equivalent) error is raised.
- If a `fixed` value is defined and the element is absent, no error is raised (the fixed value is implicitly used).
- Co-located tests cover: absent element with default, present element matching fixed, present element violating fixed.

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Add `default?: string` and `fixed?: string` to `XSDElement`.
2. **Parsing:** In `ParseNestedElementsStep.parseElement` and `ParseRootElementStep.execute`, read `el.getAttribute("default")` and `el.getAttribute("fixed")`.
3. **Validation:** Add a `validateElementFixed` node-level step that checks `node.textContent` against `schema.fixed` when defined.
4. **Missing element logic:** In `validateRequiredChildren` (or `validateOccurrence`), suppress the missing-element error when `schema.default !== undefined`.
