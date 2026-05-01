# feat-sequence-choice-occurrences: xs:sequence and xs:choice group-level minOccurs/maxOccurs

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | high    |
| Status   | done |

## Problem

Per XSD 1.0 spec (§3.8.2–3.8.3), `xs:sequence` and `xs:choice` container elements may carry their own `minOccurs` and `maxOccurs` attributes, independently of the occurrence constraints on their child elements. These group-level occurrence constraints are currently not parsed or validated.

Example — the sequence group itself is optional:

```xml
<!-- XSD: the entire sequence may appear 0 or more times -->
<xs:complexType name="AddressType">
  <xs:sequence minOccurs="0" maxOccurs="unbounded">
    <xs:element name="street" type="xs:string"/>
    <xs:element name="city"   type="xs:string"/>
  </xs:sequence>
</xs:complexType>
```

Today this is treated identically to `minOccurs="1" maxOccurs="1"`. A document with zero or multiple address sequences is not validated correctly.

## Acceptance Criteria

- `<xs:sequence minOccurs="0" maxOccurs="3">` correctly marks the group as occurring 0–3 times.
- `<xs:choice minOccurs="2" maxOccurs="unbounded">` correctly requires at least 2 choice alternatives.
- Group-level occurrence is validated independently from per-child `minOccurs`/`maxOccurs`.
- Existing sequence, choice, and occurrence tests continue to pass.

## Implementation Hints

1. **Type change:** Add `minOccurs` and `maxOccurs` to `XSDChoice` in `src/lib/types/xsd.ts`. Introduce a parallel `XSDSequenceGroup` interface (or reuse `XSDChoice`) to carry group-level occurrence on sequences.
2. **Parse step:** In `src/lib/xsd/pipeline/steps/nestedElement.ts`, extract `minOccurs`/`maxOccurs` from the `<xs:sequence>` and `<xs:choice>` DOM elements themselves (not just from their child `<xs:element>` nodes).
3. **Validation:** In `src/lib/validator/validator.ts` `validateChoice`, use group-level `minOccurs`/`maxOccurs` from `XSDChoice` to enforce how many times the choice group may appear. Add equivalent logic for sequences.
4. **Restriction context:** `src/lib/xsd/pipeline/steps/restriction.ts` parses sequences/choices in complex restriction — apply the same extraction there.
