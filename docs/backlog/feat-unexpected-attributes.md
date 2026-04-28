# feat-unexpected-attributes: Validate unexpected attributes in XML

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | high    |
| Status   | backlog |

## Problem

No validation step checks whether an XML element carries attributes that are **not declared** in the schema (`schema.attributes`). Undeclared attributes are silently allowed.

Example — schema declares no attributes, but XML element has one:

```xml
<!-- XSD -->
<xs:element name="person" type="xs:string"/>

<!-- XML — should FAIL -->
<person age="30">Alice</person>
```

Today this passes validation.

## Acceptance Criteria

- An attribute present in the XML but absent from `schema.attributes` produces an `ATTRIBUTE_INVALID` error.
- XML namespace declaration attributes (`xmlns`, `xmlns:*`) are always allowed and never flagged.
- `xsi:*` attributes (`xsi:type`, `xsi:nil`) are always allowed and never flagged.
- If `schema.attributes` is undefined or empty, the check is skipped (no declared attributes = open model).
- Existing attribute tests continue to pass.

## Implementation Hints

1. **Validation step:** Add the check inside the existing `src/lib/validator/pipeline/steps/attributes.ts` (`validateAttributes`), or create a separate `validateUnexpectedAttributes` step.
2. **Allowed-list logic:** Collect the set of declared attribute names from `schema.attributes`. For each attribute on the XML node (`node.attributes`), check if it's in the set. Exempt:
   - Attributes whose `namespaceURI` is `http://www.w3.org/2000/xmlns/` (namespace declarations)
   - Attributes whose `namespaceURI` is `http://www.w3.org/2001/XMLSchema-instance` (`xsi:*`)
3. **Registration:** If a new step is created, add it to `ValidatorImpl`'s `nodePipeline`.
