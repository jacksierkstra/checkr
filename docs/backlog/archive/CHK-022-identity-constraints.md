---
id: CHK-022
title: "Identity constraints"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: done
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

Identity constraints (unique/key/keyref) with the XPath-subset evaluator land on the component graph.

## Decision / Outcome

Identity constraints (CHK-022) landed on the component graph with the following architecture:

**Component model**: `IdentityConstraintDefinition` with `compiledSelector`/`compiledFields` (prefix-resolved at compile time) added to the component-graph types. Element declarations carry `identityConstraints`. Grammars register named identity constraints for keyref @refer resolution.

**XPath evaluator**: Implemented in `src/lib/xsd/identity-constraints.ts`. Supports the XSD 1.0 §3.11.6 subset: `.//` (descendant-or-self), `/` (child), `.` (self), `@` (attribute), `*`, `QName`, `NCName:*`. The parser validates the grammar strictly (rejects `//` without `.`, predicates, `@` in selectors, etc.).

**Compiler** (schemaCompiler.ts): Parses `xs:key`/`xs:unique`/`xs:keyref` children of element declarations in pass 1. Validates XPath syntax at compile time. Resolves keyref @refer in pass 2 (checks field count equality, rejects keyref→keyref).

**Validator** (instanceValidator.ts): Threads an `IdentityConstraintEvaluator` through the validation tree. After each element's content and attributes are validated, `evaluateElement()` is called to:
1. Evaluate the selector against the context node
2. For each target node, evaluate fields and compute key-sequences
3. Check uniqueness (for key/unique)
4. Build node tables bottom-up from children's tables + own entries
5. Resolve keyrefs against the referenced constraint's table

**Value-space equality**: Numeric (decimal, float, double) and boolean types use canonical value keys for comparison (e.g. "3.0" == "3" for decimal). String types use string equality.

**Default injection**: When a field is a single attribute step and the attribute is absent, the attribute use's default/fixed value is injected into the key-sequence (per §3.11.4 note).

**Tests**: 50+ test cases covering: XPath subset evaluation, unique (duplicates, missing fields, multi-field, decimal value-space equality, default injection, complex field rejection, multi-node field rejection), key (missing fields, nilled element fields, duplicates), keyref (matching, non-matching, field count mismatch, reference to unique), multi-field constraints, and compile-time validation (unresolvable refer, keyref→keyref, duplicate names, invalid syntax).