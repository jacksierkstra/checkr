# feat-group-attributegroup: xs:group and xs:attributeGroup support

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | high    |
| Status   | done |

## Problem

`xs:group` and `xs:attributeGroup` allow reusable named sets of elements and attributes to be defined once at schema level and referenced anywhere via `ref="..."`. They are widely used in real-world XSD schemas.

Currently, any `<xs:group ref="..."/>` or `<xs:attributeGroup ref="..."/>` inside a complex type is silently ignored. The referenced children and attributes are never injected, so the validator incorrectly reports `UNEXPECTED_ELEMENT` or `ATTRIBUTE_MISSING` errors for perfectly valid XML.

## Acceptance Criteria

- Top-level `xs:group` declarations are parsed and stored in `XSDSchema` (alongside existing `types`).
- Top-level `xs:attributeGroup` declarations are parsed and stored in `XSDSchema`.
- `xs:group ref="..."` inside `xs:sequence`, `xs:choice`, `xs:complexType`, or `xs:extension/restriction` is resolved: the referenced group's child elements are inlined at the reference point.
- `xs:attributeGroup ref="..."` inside `xs:complexType`, `xs:extension`, or `xs:restriction` is resolved: the referenced attribute group's attributes are merged into the element's attribute list.
- `minOccurs`/`maxOccurs` on a `xs:group ref` are respected (they wrap the entire group's content).
- Co-located tests cover: group used in sequence; group used in choice; attributeGroup merged into a complexType; group referenced from an extension; group with minOccurs/maxOccurs.

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Add `groups: { [name: string]: XSDElement[] }` and `attributeGroups: { [name: string]: XSDAttribute[] }` to `XSDSchema`.
2. **XSD Parser — top-level groups:** In `XSDPipelineParserImpl`, after parsing elements, scan top-level `xs:group` and `xs:attributeGroup` children of `xs:schema` and populate the new maps.
3. **XSD Pipeline — group refs in elements:** Detect `<xs:group ref="..."/>` nodes inside `ParseNestedElementsStep` (and in extension/restriction parsing); record the ref name so the resolver can expand it.
4. **Resolver:** In `ModularTypeReferenceResolver` (or a new `GroupResolver` module), after all types are resolved, expand group refs by substituting the group's element list at the reference site, and merge attributeGroup refs into the attribute list.
5. **No separate validation step needed** — once groups are fully inlined during resolution, existing validation steps handle the expanded content transparently.
