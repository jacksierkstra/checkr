# feat-namespace-qualification: elementFormDefault, attributeFormDefault, and form attribute handling

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | low     |
| Status   | backlog |

## Problem

XSD 1.0 provides two mechanisms to control whether locally-declared elements and attributes must be namespace-qualified in instance documents:

1. **`xs:schema` attributes** `elementFormDefault` and `attributeFormDefault` (default: `"unqualified"`):
   ```xml
   <xs:schema targetNamespace="http://example.com"
              elementFormDefault="qualified"
              attributeFormDefault="unqualified">
   ```

2. **Per-element/attribute `form` attribute** — overrides the schema-level default:
   ```xml
   <xs:element name="address" form="qualified"/>
   <xs:attribute name="lang" form="unqualified"/>
   ```

Checkr currently parses `targetNamespace` from `xs:schema` but does not:
- Store `elementFormDefault` or `attributeFormDefault` in `XSDSchema`
- Store the per-element/attribute `form` attribute in `XSDElement` / `XSDAttribute`
- Enforce qualification rules when matching element/attribute names during validation

The consequence is that a schema declaring `elementFormDefault="qualified"` will not trigger errors when instance documents use unqualified local elements.

## Acceptance Criteria

- `XSDSchema` gains optional `elementFormDefault?: "qualified" | "unqualified"` and `attributeFormDefault?: "qualified" | "unqualified"` fields (defaulting to `"unqualified"` when absent, per XSD 1.0 spec).
- `XSDElement` gains optional `form?: "qualified" | "unqualified"` (overrides schema default when set).
- `XSDAttribute` gains optional `form?: "qualified" | "unqualified"`.
- The XSD root-element parser (`ParseRootElementStep` / the schema-level step) reads and stores these values.
- During validation, when matching an XML element's namespace against the schema, respect the effective form (per-element `form` → schema `elementFormDefault` → default `"unqualified"`).
- Co-located tests cover: `elementFormDefault="qualified"` requiring namespaced elements, `form="unqualified"` override, default unqualified behaviour unchanged.

## Implementation Hints

1. **Types:** Add `elementFormDefault?` and `attributeFormDefault?` to `XSDSchema` in `src/lib/types/xsd.ts`. Add `form?` to `XSDElement` and `XSDAttribute`.
2. **Schema parsing:** The `XSDPipelineParserImpl` root-parse step reads the `<xs:schema>` element attributes and stores them in the returned `XSDSchema`.
3. **Attribute parsing (`ParseAttributesStep`):** Read `el.getAttribute("form")` and store it on the `XSDAttribute`.
4. **Element parsing (`ParseNestedElementsStep`, `ParseRootElementStep`):** Read `el.getAttribute("form")` and store it.
5. **Validation:** The namespace-matching logic in `ValidatorImpl` (or `validateUnexpectedElements`) needs to compute the effective form and use it when comparing the XML element's `namespaceURI` to `schema.namespace`.
6. This feature interacts with `targetNamespace` handling — review `XSDSchema.targetNamespace` usage before implementing.
