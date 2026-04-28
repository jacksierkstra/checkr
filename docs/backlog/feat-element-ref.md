# feat-element-ref: xs:element ref and xs:attribute ref support

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

XSD allows `xs:element` and `xs:attribute` nodes to reference a globally declared element or attribute via a `ref` attribute instead of an inline `name`/`type` declaration:

```xml
<xs:element ref="Address"/>
<xs:attribute ref="xml:lang"/>
```

`ParseNestedElementsStep` checks `el.getAttribute("name")` and returns `null` if the name is absent, silently dropping all `ref`-based child elements. Similarly, `ParseAttributesStep` ignores `ref`-based attributes. The result is that any child element or attribute declared via `ref` is invisible to the validator.

## Acceptance Criteria

- When `ParseNestedElementsStep` encounters an `xs:element` with a `ref` attribute (and no `name`), it creates a placeholder `XSDElement` whose `name` is the local name of the ref target and marks it for resolution.
- When `ParseAttributesStep` encounters an `xs:attribute` with `ref`, it creates a placeholder `XSDAttribute` whose `name` is the local name of the ref target.
- `ModularTypeReferenceResolver` (or a new resolver module) resolves ref placeholders against `XSDSchema.elements` (for element refs) and the schema's global attribute declarations (for attribute refs).
- After resolution, occurrence constraints from the ref site (`minOccurs`, `maxOccurs`) are preserved.
- Co-located tests cover: element with a `ref` child, element with a `ref` attribute, ref with custom `minOccurs`/`maxOccurs`.

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Add an optional `ref?: string` field to `XSDElement` and `XSDAttribute` to carry the unresolved reference name.
2. **Parsing:** In `ParseNestedElementsStep.parseElement`, check for `ref` attribute when `name` is absent; create the placeholder with `name = localName(ref)` and `ref = ref`.
3. **Parsing:** In `ParseAttributesStep`, do the same for `xs:attribute ref="..."`.
4. **Resolution:** Add a new `RefResolver` module that, after all types are registered, walks children/attributes and replaces `ref` placeholders with the resolved global declaration merged with the local occurrence overrides.
5. Register `RefResolver` in `ModularTypeReferenceResolver` so it runs as part of the existing resolution pass.
