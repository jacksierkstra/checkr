# feat-substitution-group: xs:substitutionGroup support

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | low     |
| Status   | done    |

## Problem

XSD `substitutionGroup` allows one element declaration to be substituted for another in an instance document. For example, if `DerivedAddress` is in the substitution group of `Address`, then a document may use `<DerivedAddress>` wherever `<Address>` is expected.

Checkr currently ignores `substitutionGroup` entirely. A document that uses a valid substitution will be rejected with `UNEXPECTED_ELEMENT` because the validator only matches element names exactly.

## Acceptance Criteria

- `substitutionGroup` attributes on `xs:element` declarations are parsed and stored.
- When validating child element names against the schema, the validator accepts an element whose name matches either the declared name **or** the name of any element in the applicable substitution group chain.
- Errors are correctly raised for elements that are not in the allowed substitution group.
- Co-located tests cover: direct substitution, substitution group chain (A substitutes B which substitutes C).

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Add `substitutionGroup?: string` to `XSDElement`.
2. **Parsing (`ParseRootElementStep`):** Read `el.getAttribute("substitutionGroup")` and store it.
3. **Resolution:** Build a substitution group map in `ModularTypeReferenceResolver` (or a new `SubstitutionGroupResolver` module) that maps each element name to the set of names that may substitute it.
4. **Validation:** When checking child element names in `validateUnexpectedElements` and `validateRequiredChildren`, consult the substitution group map to expand the set of acceptable names.
5. This is a moderately complex feature — consider a new ADR before implementing it.
