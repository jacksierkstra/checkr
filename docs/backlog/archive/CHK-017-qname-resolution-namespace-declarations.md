---
id: CHK-017
title: "QName resolution and namespace-correct declarations"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-008"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis documents that checkr's declaration handling is `partial` with namespace-blind child matching (`child.tagName === name`), prefix-sensitive attribute/facet parsing, `targetNamespace` never applied to the types map, and dropped attributes/facets in type-reference resolution. The ADR's grammar-per-namespace model (QName `{ns}localName` identity) is the fix. This ticket delivers the namespace-correct declaration layer every structure feature builds on.

## Deliver

Global element/attribute declarations keyed by QName in a grammar-per-namespace structure, element and attribute `ref=`, `elementFormDefault`/`attributeFormDefault` handling, and namespace-correct instance matching — fixing the gap-analysis §2 defects.

## Acceptance Criteria

- [ ] Global element and attribute declarations resolve by QName; local declarations are qualified/unqualified per `elementFormDefault`/`attributeFormDefault`
- [ ] `<xs:element ref="…">` and `<xs:attribute ref="…">` resolve at compile time; unresolved references are compile errors
- [ ] Type-reference resolution carries the full type content (children, attributes, facets — the gap analysis flags attributes/facets as dropped today)
- [ ] Instance matching is namespace-aware: qualified elements/attributes match by namespace, unqualified by form rules
- [ ] `targetNamespace` applies consistently to global declarations and their type members
- [ ] A namespaced schema/instance pair (like the benchmark fixture, but with qualified children) validates correctly

## Out of Scope

- Content-model semantics (CHK-018)
- Multi-document assembly (CHK-024)

## Dependencies

Blocked by CHK-008 (component-graph core).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the QName/grammar-per-namespace declaration layer land and fix the namespace-blind matching defects?

## Answer

Yes — the QName/grammar-per-namespace declaration layer landed and fixes the gap-analysis §2 namespace-blind matching defects. Global element and attribute declarations are keyed by QName per grammar; `ref=` references (element and attribute) resolve at compile time and carry the referenced declaration's type onto the particle/attribute use; unresolved references are compile-time errors; instance matching is namespace-aware (`{ns}localName` identity per the ADR §2).

## Decision / Outcome

Implemented the namespace-correct declaration layer on the component graph (CHK-017):

- **Global attributes registered by QName**: `CompiledGrammar` now carries an `attributes` map (alongside `elements`/`types`), and top-level `xs:attribute` declarations compile into it under the target namespace. This is the `ref=` resolution target for attribute uses.
- **Element `ref=`**: a local particle `<xs:element ref="…">` compiles as a local declaration carrying the referenced QName (`ElementDeclaration.ref`); pass-2 resolution looks the reference up across grammars and carries the referenced global declaration's `type` (and `nillable`) onto the particle, so instance validation enforces the referenced type rather than treating it as `anyType`. Forward references resolve via the existing multi-pass registration.
- **Attribute `ref=`**: `<xs:attribute ref="…">` resolves the same way (`AttributeDeclaration.ref` → global declaration's simple type), with the use's own `use`/`fixed`/`default` kept on the use.
- **Unresolved references are compile errors**: new `UNRESOLVED_REFERENCE` `SchemaErrorCode`, distinct from `UNRESOLVED_TYPE`, reported in the `schema-compilation` phase.
- **Instance matching is namespace-aware**: qualified elements/attributes match by namespace; unqualified by form rules (`elementFormDefault`/`attributeFormDefault`), already via `qnameEqual`; added end-to-end tests for a benchmark-like fixture with `elementFormDefault="qualified"`, cross-prefix refs in the same namespace, and qualified global-attribute refs.
- **Type-reference resolution carries full content**: `type=` resolves to the actual type definition in the graph (children, attributes, facets), verified by test — the gap-analysis "dropped attributes/facets" defect belongs to the superseded flat model.

Deferred to later tickets: substitution-group members accepted in place of a `ref`'d head (CHK-023) and foreign-namespace grammars via multi-document assembly (CHK-024) — a `ref=` into a namespace with no grammar is currently a compile error, which is the correct pre-CHK-024 behavior.

Verification: `node scripts/agent-check.mjs test` and `node scripts/agent-check.mjs build` both pass.