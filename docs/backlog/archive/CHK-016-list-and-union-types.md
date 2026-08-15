---
id: CHK-016
title: "List and union types"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-010", "CHK-011", "CHK-012", "CHK-013", "CHK-014"]
required_context: ["docs/research/gap-analysis.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates `xs:list` and `xs:union` `missing` — the NIST list/union data is untouched. List types split values on whitespace and validate each item against an item type; union types accept a value if any member type accepts it. Both sit on top of the atomic-type families and the facet framework.

## Deliver

`xs:list` and `xs:union` simple types with correct item/member semantics, plus enumeration and pattern working across derived simple types.

## Acceptance Criteria

- [ ] `xs:list`: values split on whitespace; each item validates against the item type; list facets (`length`/`minLength`/`maxLength`) apply to the item count, `pattern`/`enumeration` to the whole lexical form
- [ ] `itemTypeFacets` (min/max length, pattern) apply to items where declared
- [ ] `xs:union`: a value is valid if at least one member type accepts it; union member resolution per spec
- [ ] Enumeration/pattern facets work across restriction chains and on derived simple types (the gap analysis flags these as currently dropped by type-reference resolution)
- [ ] A NIST-style list and union schema/instance pair validates end-to-end through the two-phase API

## Out of Scope

- Atomic type families themselves (CHK-011–014)

## Dependencies

Blocked by CHK-010 (facet framework) and the atomic families CHK-011–014 (item/member types must exist to validate against).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can list and union types land with correct item/member semantics on top of the atomic families?

## Answer

Yes. List and union types now land with correct item/member semantics on top of the atomic families and the facet framework (CHK-010–014), implemented on the component-graph model (CHK-008).

## Decision / Outcome

Implemented `xs:list` and `xs:union` simple types with item/member validation semantics, plus enumeration/pattern working across restriction chains on derived simple types.

**Component graph** (`src/lib/types/component-graph.ts`): `SimpleTypeDefinition` gains two resolved-reference fields — `itemTypeDef` (resolved item type of a list: from the `itemType` attribute or an inline anonymous `xs:simpleType`) and `memberTypeDefs` (resolved union member types: `memberTypes` attribute members followed by inline anonymous members in document order).

**Compiler** (`src/lib/xsd/compiler/schemaCompiler.ts`):
- `xs:list` builds an inline anonymous item type when no `itemType` attribute is present.
- `xs:union` builds inline anonymous member types and keeps them ordered after the `memberTypes` attribute members.
- Pass 3 (`resolveSimpleTypes`) now resolves list item types into `itemTypeDef` and union member types into `memberTypeDefs`; propagates variety down restriction chains (a restriction of a list is itself a list, a restriction of a union is itself a union); inherits item/member definitions through those chains; and reports an error when an item/member type resolves to a non-simple type. WhiteSpace is fixed per spec: `collapse` for lists, `preserve` for unions.

**Facets** (`src/lib/xsd/facets.ts`): added `splitListItems`; `length`/`minLength`/`maxLength` now count list *items* (not code points/octets) for list-variety types; `enumeration` compares list values item-wise after splitting (the whole lexical form for other varieties); `pattern` applies to the whole list lexical form.

**Validator** (`src/lib/validator/compiled/instanceValidator.ts`): `validateTextValue` dispatches by variety — atomic (existing lexical + facet checks, messages unchanged), list (each item validated against the item type including its facets, then whole-form facets), union (value is valid if at least one member type accepts it, each member applying its own whitespace normalization; `UNION_VIOLATION` reported when no member accepts).

**Errors** (`src/lib/types/schema-error.ts`): new `UNION_VIOLATION` code.

Coverage: 501 tests pass (28 new: compile-side resolution/derivation, end-to-end instance validation, direct facet semantics, and a NIST-style list+union schema validated through the public two-phase API `compileSchema`/`validate`).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

Both pass, and the full check (`node scripts/agent-check.mjs full`) exits 0 with `AGENT_CHECK_FULL_PASS`.