# feat-attribute-prohibited: xs:attribute use="prohibited"

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | done |

## Problem

XSD 1.0 allows `use="prohibited"` on an `xs:attribute` declaration inside `xs:complexContent > xs:restriction` to explicitly forbid an attribute inherited from the base type. This is the standard mechanism for narrowing an attribute set during complex type restriction.

`XSDAttribute.use` is currently typed as `"required" | "optional"`. The `ParseAttributesStep` reads the `use` attribute from the DOM but the cast `as "required" | "optional"` silently coerces `"prohibited"` to `"optional"`, so:
1. A `use="prohibited"` attribute is stored as optional, meaning its presence is not flagged.
2. If a validated XML element contains a prohibited attribute, no error is raised.

## Acceptance Criteria

- `XSDAttribute.use` type includes `"prohibited"` as a valid value.
- `ParseAttributesStep` correctly stores `use: "prohibited"` when the XSD declares it.
- The attribute validator (`validateAttributes`) raises an `ATTRIBUTE_INVALID` error when an XML element contains an attribute whose schema entry has `use: "prohibited"`.
- A prohibited attribute that is absent produces no error (correct — absence is the required state).
- Co-located tests cover: prohibited attribute present in XML (error); prohibited attribute absent (ok); interaction with xs:complexContent restriction narrowing an inherited attribute set.

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Update `XSDAttribute.use` to `"required" | "optional" | "prohibited"`.
2. **Parsing (`ParseAttributesStep`):** Remove the explicit cast; let the raw attribute value through. `"prohibited"` will now be stored correctly.
3. **Validation (`validateAttributes`):** Add a check — if a schema attribute has `use: "prohibited"` and the XML element has an attribute with that name, push an `ATTRIBUTE_INVALID` error.
