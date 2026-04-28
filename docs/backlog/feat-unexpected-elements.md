# feat-unexpected-elements: Validate unexpected elements in XML

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | high    |
| Status   | done |

## Problem

The error code `UNEXPECTED_ELEMENT` is defined in `src/lib/types/validation.ts` but **no validation step ever emits it**. Elements present in an XML document that are not declared in the schema are silently accepted, making Checkr too permissive for strict schema validation.

Example — schema defines only `<name>`, but XML contains `<name>` and `<unknown>`:

```xml
<!-- XSD -->
<xs:element name="person">
  <xs:complexType>
    <xs:sequence>
      <xs:element name="name" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
</xs:element>

<!-- XML — should FAIL -->
<person>
  <name>Alice</name>
  <unknown>extra</unknown>
</person>
```

Today this passes validation.

## Acceptance Criteria

- Child elements of a node that are not listed in `schema.children` produce an `UNEXPECTED_ELEMENT` error.
- Elements inside `xs:choice` alternatives that are not part of the choice definition are also flagged.
- Elements at the document root not present in `schema.elements` produce an error.
- `xs:any` wildcard (when implemented) suppresses this check within its scope.
- Existing tests that validate expected elements continue to pass.

## Implementation Hints

1. **Validation step:** Create `src/lib/validator/pipeline/steps/unexpectedElements.ts` implementing `NodeValidationStep`. For each child element of the XML node, check whether its `localName`/`tagName` appears in `schema.children`. Emit `UNEXPECTED_ELEMENT` for each child not found.
2. **Registration:** Add `validateUnexpectedElements` to `ValidatorImpl`'s `nodePipeline`.
3. **Root elements:** Extend `validateRootElements` in `src/lib/validator/pipeline/steps/rootElements.ts` to also flag root XML elements not listed in `schema.elements`.
4. **Edge cases:**
   - If `schema.children` is undefined/empty, skip the check (element has no defined content model — treat as open).
   - Text nodes (nodeType ≠ 1) must be ignored.
   - Namespace-prefixed children should be matched by `localName`.
