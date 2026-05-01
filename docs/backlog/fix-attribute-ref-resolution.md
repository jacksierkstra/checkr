# fix-attribute-ref-resolution: xs:attribute ref= type and facet resolution

| Field    | Value  |
|----------|--------|
| Type     | bug    |
| Priority | high   |
| Status   | backlog |

## Problem

`<xs:attribute ref="globalAttr"/>` is correctly identified during XSD parsing — the `ref` field on `XSDAttribute` is populated. However, the global attribute declaration's `type`, `fixed`, `default`, and facets (`enumeration`, `pattern`, `minLength`, `maxLength`, `length`) are **never merged into the referencing attribute**. The validator only sees `{ ref: "globalAttr" }` with no type or constraint information, so validation is silently skipped.

Example:

```xml
<!-- XSD -->
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:attribute name="lang" type="xs:language" use="required"/>

  <xs:element name="text">
    <xs:complexType>
      <xs:attribute ref="lang"/>
    </xs:complexType>
  </xs:element>
</xs:schema>

<!-- XML — should FAIL: "123" is not a valid xs:language -->
<text lang="123"/>
```

Today this passes.

## Acceptance Criteria

- `xs:attribute ref=` resolves the referenced global attribute and inherits its `type`, `fixed`, `default`, `use`, and facets.
- A referenced attribute with `type="xs:language"` validates the attribute value as a language code.
- `use` on the global attribute is inherited unless overridden by the reference.
- Existing attribute tests continue to pass.

## Implementation Hints

1. **Schema storage:** `XSDSchema` stores global elements in `types` and groups in `groups`. Add a `globalAttributes?: { [name: string]: XSDAttribute }` map to store top-level `xs:attribute` declarations.
2. **XSD parser:** In the XSD pipeline parser (`src/lib/xsd/parser.ts`), after parsing step results, collect top-level `<xs:attribute>` nodes and populate `schema.globalAttributes`.
3. **Resolver:** In `src/lib/xsd/resolvers/modules/RefResolver.ts` (or a new `AttributeRefResolver` module), resolve each `XSDAttribute` with a `ref` field by looking up `schema.globalAttributes[ref]` and merging properties.
4. **Merge rule:** The referencing declaration may override `use` but should inherit everything else from the global definition.
