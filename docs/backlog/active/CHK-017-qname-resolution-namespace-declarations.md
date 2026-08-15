---
id: CHK-017
title: "QName resolution and namespace-correct declarations"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
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

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*