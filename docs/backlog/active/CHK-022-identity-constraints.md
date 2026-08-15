---
id: CHK-022
title: "Identity constraints"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-017", "CHK-018"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates identity constraints `missing` — not parsed, and requires an XPath-subset evaluator that the ADR explicitly flags as a "known complex piece deferred to feature work." The `IdentityConstraint_w3c.xml` set (840 groups) and Sun `IdConstrDefs.testSet` are the second-largest structure set. This ticket delivers the `unique`/`key`/`keyref` semantics with the selector/field XPath evaluator.

## Deliver

An XPath-subset evaluator for selector/field paths (child axis, attribute axis, predicates, indexes) and the `unique`/`key`/`keyref` constraint engine with document-scoped identity tables.

## Acceptance Criteria

- [ ] XPath-subset evaluator: `child::`, `attribute::`, `..` (self), `@`, `*`, `descendant::` work for selector/field paths per the XSD subset
- [ ] `unique`: value tuples computed per selector-targeted element; tuples must be unique within the scope
- [ ] `key`: same as unique plus non-nil requirement (each field must have a non-nil value)
- [ ] `keyref`: references must match a key/unique tuple within the referenced scope
- [ ] Errors are reported with the identity-constraint context (selector/field, scope element, tuple values)
- [ ] A representative IdentityConstraint test validates end-to-end

## Out of Scope

- Full XPath support (the XSD subset only)
- ID/IDREF document-scoped matching (the gap analysis defers this to this ticket; the string-family ticket (CHK-011) covers lexical forms only)

## Dependencies

Blocked by CHK-017 (declarations the identity constraints attach to) and CHK-018 (content models the selector navigates).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can identity constraints (unique/key/keyref) with the XPath-subset evaluator land on the component graph?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*