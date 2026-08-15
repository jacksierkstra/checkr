---
id: CHK-020
title: "Complex-content derivation"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-017", "CHK-010"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates complex-content derivation `missing` — no `complexContent`, `extension`, `restriction`, `simpleContent`, or `mixed` content support exists. The XSTS's `ComplexType_w3c.xml` (551 groups) and `Additional_w3c.xml` (287 groups) heavily exercise derivation. The ADR's compile-time validation model makes this the right home for the **CTR-with-`all`** implementation-defined choice (declared as `CTR-all-compile` per the gap analysis §5).

## Deliver

`complexContent` extension/restriction, `simpleContent` extension/restriction, `mixed` content, and the CTR-with-`all` compile-time rejection under the declared `CTR-all-compile` option.

## Acceptance Criteria

- [ ] `complexContent` extension: base type content extended with new particles/attribute uses, derivation rules enforced
- [ ] `complexContent` restriction: effective content model restricted per the spec's derivation rules
- [ ] `simpleContent` extension/restriction: simple types with attributes, works with the facet framework (CHK-010)
- [ ] `mixed` content: text mixed with elements validated per spec
- [ ] Complex-type restriction with `all`-groups is always rejected at compile time (`CTR-all-compile` option)
- [ ] Invalid derivations (per spec rules) are compile-time errors, not instance-validation errors

## Out of Scope

- Wildcards in derivation (CHK-021)
- Substitution groups interacting with type hierarchy (CHK-023)

## Dependencies

Blocked by CHK-017 (declarations the types inhabit) and CHK-010 (simple types for simpleContent).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can complex-content derivation (extension/restriction, simpleContent, mixed, CTR-all-compile) land on the component graph?

## Answer

Yes — complex-content derivation (extension/restriction, simpleContent, mixed, CTR-all-compile) lands on the component graph.

## Decision / Outcome

Implemented complex-content derivation on the component graph (CHK-020):

### Component-graph types
- **`DerivationMethod`**: New exported type (`"extension" | "restriction"`) for the `ComplexTypeDefinition.derivationMethod` field.
- **`ComplexTypeDefinition.baseType`**: New field (`ComplexTypeDefinition | null`) — the resolved base complex type for derived types.
- **`ComplexTypeDefinition.derivationMethod`**: New field (`DerivationMethod | null`) — how the type derives from its base.

### Schema compiler
- **Pass 1 — `buildComplexType`**: Full restructuring:
  - `xs:complexContent` with `xs:extension` or `xs:restriction`: parsed, base QName tracked, new content particle built.
  - `xs:simpleContent` with `xs:extension`: parsed (base may be a simple type or complex-with-simple-content).
  - `xs:simpleContent` with `xs:restriction`: builds an anonymous simple type with facets; base may be a simple type or complex-with-simple-content.
  - `mixed` attribute on `xs:complexType` (and `xs:complexContent`): produces `contentType: "mixed"`.
  - Attribute uses parsed from the correct element (extension/restriction for derived types, complexType for plain).
- **Pass 2e — `resolveDerivationBases`**: Resolves the base QName of each derivation to the corresponding complex type (or records simple-type base for simpleContent).
- **Pass 2f — `computeDerivedContent`**: Computes effective content:
  - Extension (complex): splices base particle + new particle into a sequence.
  - Extension (simple): inherits the base's simple type.
  - Restriction: keeps the declared particle (complex) or anonymous simple type (simple).
  - Attribute uses: for extension, base's uses + new; for restriction, own uses (subset validated).
- **Pass 3b — `validateDerivations`**: Validates per-spec:
  - Extension: must not extend simple-content base with complexContent; attribute name clash rejection.
  - Restriction: content-type compatibility (simple/empty/complex), CTR-all-compile (all-group → error), particle restriction (sequence→sequence/choice→choice with ordered-subset injection), element type restriction, attribute subset + type restriction + requiredness.
  - Circular derivation chains detected.
- **`buildAttributeGroupDefinition`**: Refactored to use `readComplexTypeUses` (shared with `buildComplexType`).
- **`resolveSimpleTypes`**: Extended for simpleContent restriction against complex-with-simple-content bases (base type = the complex's simple type).

### Error codes
- `INVALID_EXTENSION` — extension rule violations.
- `INVALID_RESTRICTION` — restriction rule violations.
- `ALL_GROUP_RESTRICTION` — CTR-all-compile rejection.
- `CIRCULAR_DERIVATION` — circular type derivation chain.

### Instance validator
- `mixed` content with null particle (empty compositor): rejects element children.
- `element-only` content with null particle (restriction to empty): rejects element children.

### Tests
- 18 new compiler tests: extension splicing, attribute inheritance + clash, empty-base extension, content-type rules, simpleContent extension (direct + chained), simpleContent restriction (pure simple + complex base, with and without attributes), restriction particle validation, all-group rejection, circular derivation, mixed content.
- 11 new validator end-to-end tests: extension (order, attributes, text), simpleContent extension (text, attrs, children), simpleContent restriction (facets, attribute inheritance), complexContent restriction (occurs, element omission), mixed content (text + elements, null-particle).