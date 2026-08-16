---
id: CHK-025
title: "Schema-for-schemas conformance"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-024"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The ADR requires schema-for-schemas validation at compile time (CHK-004 §7): malformed schemas must be compile-time errors, not instance-validation surprises. The gap analysis notes this is `missing` — checkr currently has no schema validity checking. The XSTS includes ~14,328 schema tests (`schemaTest`) that expect either `valid` or `invalid` for a schema document. This ticket completes the compile-time conformance surface so those schema tests can score.

## Deliver

Compile-time schema validity checking across all supported constructs: invalid facet combinations, circular derivations, duplicate components, invalid component references, abstract-component misuse, and any other conformance rules in the XSD 1.0 spec for the features implemented in CHK-008–024. Each malformed schema produces a `SchemaError` with the appropriate code and severity.

## Acceptance Criteria

- [ ] A schema that is malformed per the XSD 1.0 spec (for implemented features) fails compilation with one or more `SchemaError` codes
- [ ] A schema that is conforming per the spec compiles without schema-level errors
- [ ] Schema errors are reported through the `SchemaError` listener with `phase: schema-compilation`, not mixed into instance-validation results
- [ ] The error taxonomy covers the conformance rules for each feature area (facet combos, derivation rules, circular refs, duplicate components, abstract misuse, etc.)
- [ ] A representative schemaTest pair (valid/invalid schema) from the XSTS scores correctly

## Out of Scope

- Features not yet implemented (CHK-026–027 add their conformance surface incrementally)

## Dependencies

Blocked by CHK-024 (multi-document assembly must work before the full schema-level conformance can be checked across documents).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can compile-time schema-for-schemas conformance be completed across all implemented features, making the ~14k schemaTest surface scoreable?

## Answer

Yes — with the additions in this ticket, malformed schemas across the implemented feature surface (CHK-008–024) fail compilation with specific `SchemaError` codes through the `schema-compilation`-phase listener, conforming schemas compile clean, and the taxonomy now covers the feature areas the ticket lists. The ~14k XSTS `schemaTest` surface becomes scoreable at the CHK-006 runner boundary (a mini schemaTest scorer demonstrating this ships in the test suite; the full corpus is CHK-028).

## Decision / Outcome

**Completed (CHK-025).** Compile-time schema-for-schemas conformance now spans every implemented feature area:

- **Facet conformance (new):** `checkFacetConformance` validates facet values against their lexical spaces (`length`/`minLength`/`maxLength`/`totalDigits`/`fractionDigits` must be non-negative integers, `whiteSpace` ∈ {preserve, replace, collapse}) and combination rules (no duplicate kinds except `pattern`/`enumeration`; `length` excludes `minLength`/`maxLength`; `minInclusive`/`minExclusive` and `maxInclusive`/`maxExclusive` are mutually exclusive; a lower bound must not exceed an upper bound when both are plain decimals; `fractionDigits` ≤ `totalDigits`). New codes `INVALID_FACET_VALUE` / `INVALID_FACET_COMBINATION`.
- **Occurrence conformance (new):** `checkOccurrences` rejects `minOccurs > maxOccurs`, negatives, `minOccurs="unbounded"`, non-integer values, and `minOccurs`/`maxOccurs` on attributes. New code `INVALID_OCCURRENCE`.
- **Declaration property conformance (new):** name/ref mutual exclusion and presence on elements and attributes; forbidden attributes on `ref=` (type, nillable, default, fixed, substitutionGroup, abstract, block, form, identity constraints); type+inline-type exclusion; inline simpleType+complexType exclusion; nillable+default/fixed exclusion; attribute default+fixed and required+default exclusion; `use` value ∈ {optional, prohibited, required}; `form`/`elementFormDefault`/`attributeFormDefault` ∈ {qualified, unqualified}; `form`/`minOccurs`/`maxOccurs` on global declarations; substitutionGroup on local declarations; unknown `block`/`final`/`blockDefault`/`finalDefault` tokens. New code `INVALID_DECLARATION`.
- **Structure rules (new):** at most one content-model child per complexType (sequence/choice/all/any vs simpleContent/complexContent), and exactly one extension/restriction per simpleContent/complexContent.
- **Abstract-component misuse:** kept as an instance-time check (`ABSTRACT_ELEMENT`/`ABSTRACT_TYPE` in the instance validator). XSD 1.0 §3.3.6 arguably makes `ref=` to an abstract element a schema error; checkr deliberately keeps it legal at compile time, matching the CHK-023 behavior and the common abstract-head pattern. **Deferred** to XSTS verification (CHK-028) before making it a compile error — recorded to avoid a silent behavior change.

**Files:** `src/lib/types/schema-error.ts` (4 new codes), `src/lib/xsd/compiler/schemaCompiler.ts` (checks above), `src/lib/xsd/compiler/schema-conformance.test.ts` (new: 84 tests incl. the mini XSTS schemaTest scorer with representative valid/invalid pairs).

**Acceptance criteria:**
- [x] Malformed schemas fail compilation with specific `SchemaError` codes
- [x] Conforming schemas compile without schema-level errors (no false positives on the existing suite)
- [x] Errors flow through the listener with `phase: schema-compilation`, separate from instance-validation results
- [x] Taxonomy covers facet combos, derivation rules (existing), circular refs (existing), duplicate components (existing), declaration conflicts, occurrence rules, abstract misuse (instance-time)
- [x] A representative schemaTest pair (valid/invalid) scores correctly in the mini harness