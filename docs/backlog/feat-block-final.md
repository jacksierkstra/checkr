# feat-block-final: block/final/blockDefault/finalDefault derivation control

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | low     |
| Status   | done |

## Problem

XSD 1.0 provides `block` and `final` attributes on `xs:element` and `xs:complexType`, and `blockDefault`/`finalDefault` on `xs:schema`, to control which forms of type derivation and substitution are permitted.

- **`final`** on a type: prevents further derivation by `restriction`, `extension`, or both (`#all`).
- **`block`** on an element: prevents substitution or use of derived types (`restriction`, `extension`, `substitution`, or `#all`).
- **`blockDefault`** / **`finalDefault`** on `xs:schema`: set the default `block`/`final` behaviour for all elements/types in the schema.

Currently none of these attributes are parsed or enforced. Schemas that use `final="extension"` or `block="#all"` are treated as having no such constraint.

## Acceptance Criteria

- `block` and `final` on `xs:element` are parsed and stored on `XSDElement`.
- `final` on `xs:complexType` is parsed and stored.
- `blockDefault` and `finalDefault` on `xs:schema` are parsed and stored on `XSDSchema`.
- During type resolution, if a type is marked `final="extension"`, attempting to extend it produces a validation error with a new code `"DERIVATION_BLOCKED"`.
- During substitution group resolution, if an element is marked `block="substitution"` or `block="#all"`, substitution group members are not allowed and produce a `"DERIVATION_BLOCKED"` error.
- `blockDefault`/`finalDefault` are applied as defaults when the per-element/type attribute is absent.
- Co-located tests cover: final="extension" blocks extension; block="substitution" blocks substitution; blockDefault applied to elements without explicit block; valid derivation passes.

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Add `block?: string`, `final?: string` to `XSDElement`. Add `blockDefault?: string`, `finalDefault?: string` to `XSDSchema`.
2. **`ValidationErrorCode`:** Add `"DERIVATION_BLOCKED"` to the union.
3. **Parsing:** Capture `block`/`final` in the root element parsing step. Capture `blockDefault`/`finalDefault` in the schema-level parser.
4. **Resolution:** In `TypeExtender` and `SubstitutionGroupResolver`, check `final` / `block` values before performing derivation/substitution and return an appropriate error if blocked.
