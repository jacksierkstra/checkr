# ADR-027: xs:substitutionGroup Support

**Status:** Accepted  
**Supersedes:** [ADR-009](./ADR-009-deferred-xsd-features.md) *(for xs:substitutionGroup only)*

---

## Context

XSD 1.0 `substitutionGroup` allows one global element declaration to be substituted for another in an instance document. For example:

```xml
<xs:element name="Address" type="AddressType"/>
<xs:element name="USAddress" type="USAddressType" substitutionGroup="Address"/>
```

A document may then use `<USAddress>` wherever `<Address>` is expected. Substitution groups can form chains: `USAddress` substitutes `Address`, `NYAddress` substitutes `USAddress`, so `NYAddress` is also a valid substitute for `Address`.

Currently Checkr ignores `substitutionGroup` entirely, causing valid substitution-using documents to be rejected with `UNEXPECTED_ELEMENT`.

---

## Decision

Implement `xs:substitutionGroup` support as follows:

### Schema type changes
- Add `substitutionGroup?: string` to `XSDElement` in `src/lib/types/xsd.ts`.

### Parsing
- `ParseRootElementStep` reads `el.getAttribute("substitutionGroup")` and stores it.

### Resolution — Substitution Group Map
- Add a new `SubstitutionGroupResolver` module in `src/lib/xsd/resolvers/modules/`.
- After all root elements are parsed, this module builds a map: `{ [headElementName: string]: Set<string> }` that lists all element names (transitively) that may substitute a given head element.
- The map is stored on `XSDSchema` as `substitutionGroups: { [head: string]: string[] }`.
- Circular substitution chains must be detected and result in a `PARSE_ERROR`.

### Validation
- `validateUnexpectedElements` and `validateRequiredChildren` consult `schema.substitutionGroups` to expand the set of acceptable element names when checking children.
- Both the head element name and all substituting names are treated as valid matches.

### Abstract elements
- If a head element is declared `abstract="true"`, a direct instance of the head element in a document is invalid (already enforced by `validateAbstract`). Only substituting members are allowed. No new logic needed — `validateAbstract` already handles this.

---

## Consequences

- **Positive:** Schemas using `xs:substitutionGroup` are correctly validated.
- **Positive:** The `SubstitutionGroupResolver` is self-contained and does not require changes to the validation pipeline steps beyond the two noted above.
- **Negative:** `XSDSchema` gains a `substitutionGroups` map, increasing the schema object size.
- **Negative:** Substitution group chains require transitive closure computation; depth must be bounded to prevent infinite loops on circular schemas.
- **Neutral:** The `feat-substitution-group` backlog item covers implementation details; this ADR covers the architectural decisions.
