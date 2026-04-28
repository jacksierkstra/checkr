# feat-wildcard-any: xs:any and xs:anyAttribute wildcard support

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | done    |

## Problem

`xs:any` allows an element to contain child elements from any (or a constrained) namespace. `xs:anyAttribute` allows any (or constrained) attributes. Neither is currently parsed or considered during validation.

The current effect is incorrect and depends on context:
- An element whose schema has `xs:any` alongside named children will have the wildcard silently dropped, so any extra child elements are flagged as `UNEXPECTED_ELEMENT` even though the schema permits them.
- An element whose schema has `xs:anyAttribute` will have extra attributes flagged as `ATTRIBUTE_INVALID` even though the schema permits them.

## Acceptance Criteria

- `xs:any` inside `xs:sequence` or `xs:choice` is parsed; the containing element's schema records that a wildcard child slot exists.
- When `validateUnexpectedElements` checks child elements, it skips the unexpected-element error if the schema declares an `xs:any` wildcard (for the simplest implementation: treat `processContents="skip"` semantics — allow anything).
- `xs:anyAttribute` is parsed; `validateAttributes` skips the unexpected-attribute error when the schema declares `xs:anyAttribute`.
- `namespace` and `processContents` attributes on `xs:any`/`xs:anyAttribute` are stored but enforcement of namespace constraints is out of scope for the initial implementation.
- Co-located tests cover: element with only `xs:any`; element with named children plus `xs:any`; element with `xs:anyAttribute`.

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Add `allowAnyChild?: boolean` to `XSDElement` and `allowAnyAttribute?: boolean` to `XSDElement`.
2. **Parsing:** In `ParseNestedElementsStep`, detect `<xs:any>` children and set `allowAnyChild = true`. In `ParseAttributesStep`, detect `<xs:anyAttribute>` and set `allowAnyAttribute = true`.
3. **Validation:** In `validateUnexpectedElements`, return `[]` early if `schema.allowAnyChild` is true. In `validateAttributes`, skip the unexpected-attribute check if `schema.allowAnyAttribute` is true.
