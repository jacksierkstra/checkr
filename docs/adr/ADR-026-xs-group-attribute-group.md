# ADR-026: xs:group and xs:attributeGroup Support

**Status:** Accepted  
**Supersedes:** [ADR-009](./ADR-009-deferred-xsd-features.md) *(for xs:group and xs:attributeGroup only)*

---

## Context

XSD 1.0 named model groups (`xs:group`) and attribute groups (`xs:attributeGroup`) allow reusable, named collections of element declarations and attribute declarations to be defined at the schema level and referenced elsewhere:

```xml
<xs:group name="PersonName">
  <xs:sequence>
    <xs:element name="firstName" type="xs:string"/>
    <xs:element name="lastName" type="xs:string"/>
  </xs:sequence>
</xs:group>

<xs:complexType name="Employee">
  <xs:sequence>
    <xs:group ref="PersonName"/>
    <xs:element name="department" type="xs:string"/>
  </xs:sequence>
</xs:complexType>
```

ADR-009 deferred these features because they require a **second-pass symbol table**: groups must be fully parsed before any type that references them can be resolved. The current single-pass `XSDPipelineParserImpl` pipeline does not support this.

---

## Decision

Add support for `xs:group` and `xs:attributeGroup` by introducing a two-phase parse strategy:

### Phase 1 — Group collection
- `XSDPipelineParserImpl` scans the schema document for top-level `xs:group` and `xs:attributeGroup` declarations *before* resolving element types.
- Parsed groups are stored in `XSDSchema` under new maps: `groups: { [name: string]: XSDElement[] }` and `attributeGroups: { [name: string]: XSDAttribute[] }`.

### Phase 2 — Group expansion (resolution)
- A new `GroupExpanderModule` in `src/lib/xsd/resolvers/modules/` replaces `xs:group ref=` and `xs:attributeGroup ref=` placeholders with the corresponding expanded children/attributes.
- This module runs as part of the existing `ModularTypeReferenceResolver` pass, after the group symbol table is populated.

### Schema type changes
- `XSDSchema` gains `groups` and `attributeGroups` maps.
- `XSDElement` gains a transient `groupRef?: string` marker (cleared after expansion).
- `XSDAttribute` gains a transient `attributeGroupRef?: string` marker (cleared after expansion).

### Parsing changes
- `ParseNestedElementsStep` recognises `xs:group` children with a `ref` attribute and emits a placeholder `XSDElement` with `groupRef` set.
- A new `ParseAttributeGroupStep` (or extension to `ParseAttributesStep`) handles `xs:attributeGroup ref=` inside complex types.
- A new top-level parse step collects `xs:group` / `xs:attributeGroup` declarations into `XSDSchema.groups` / `.attributeGroups`.

---

## Consequences

- **Positive:** Schemas using named groups can be validated correctly.
- **Positive:** The `GroupExpanderModule` integrates cleanly into the existing resolver pipeline with no changes to `ValidatorImpl`.
- **Negative:** `XSDSchema` grows two new maps; implementations that construct `XSDSchema` objects manually (e.g., in tests) may need updating.
- **Negative:** Group expansion increases resolution-phase complexity. Circular group references must be detected and rejected (emit `PARSE_ERROR`).
- **Negative:** The two-phase parse is a conceptual departure from the current single-pass pipeline. Clear documentation of the order of operations is essential.
