---
id: CHK-010
title: "Simple-type definitions and facet framework"
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

The gap analysis rates checkr's simple-type support `partial` (four facets, string-only, UTF-16 length counting, no type hierarchy). The XSTS datatype sets (NIST ~3,953 groups, Microsoft DataTypes 2,247, SimpleType 340) are the largest scoring surface in the suite, and all of it hangs off simple-type definitions and facets. This ticket lays the framework: simple type definitions in the component graph with the facet machinery every built-in family then builds on.

## Deliver

`xs:simpleType` definitions (inline and global) compiling into typed simple type definitions with variety (atomic/list/union), a facet representation, whitespace normalization, and the length-family facets with correct code-point counting and facet inheritance down restriction chains.

## Acceptance Criteria

- [ ] `xs:simpleType` definitions (inline and global) compile into simple type definitions carrying variety and base type
- [ ] Facet framework parses and attaches facets to types; restriction chains inherit and re-constrain facets per XSD derivation rules
- [ ] `length`/`minLength`/`maxLength` count code points, not UTF-16 code units (the gap analysis flags `text.length` as wrong for supplementary characters)
- [ ] `whiteSpace` preserve/replace/collapse is applied before facet checks
- [ ] A simpleType restriction validates instance text end-to-end through the two-phase API

## Out of Scope

- Built-in type lexical/value spaces (CHK-011–014)
- The XSD regex dialect powering `pattern` (CHK-015)
- List/union item semantics (CHK-016)

## Dependencies

Blocked by CHK-008 (the component-graph core the types live in).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the simple-type/facet framework land on the component graph with code-point-correct length semantics and facet inheritance?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*
