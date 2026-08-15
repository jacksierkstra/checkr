---
id: CHK-023
title: "Substitution groups and declaration attributes"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-017", "CHK-018"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates substitution groups, `nillable`/`xsi:nil`, `abstract`/`final`/`block`, and element `default`/`fixed` all `missing`. These are declaration-level attributes that control instance-validation behavior: which elements are accepted (substitution groups), whether an element can be nil, whether a type can be used directly, and whether default values are injected. They sit on the declaration layer (CHK-017) and content models (CHK-018).

## Deliver

Substitution-group hierarchy with transitive head/member resolution, `abstract`/`final`/`block` enforcement, `nillable` + `xsi:nil` handling, and element `default`/`fixed`.

## Acceptance Criteria

- [ ] Substitution group heads declared with `<xs:element … substitutionGroup="…">`; members accepted in place of the head at validation time, including transitive membership
- [ ] `abstract="true"` elements/types rejected when instantiated directly; non-abstract members accepted
- [ ] `final`/`block` constraints on types and elements enforced
- [ ] `nillable="true"`: element accepted with `xsi:nil="true"` and empty content; `xsi:nil` on non-nillable rejected
- [ ] Element `default` injected when the instance element is absent; `fixed` enforced against the instance value
- [ ] A substitution-group test (Element set) validates end-to-end

## Out of Scope

- Multi-document substitution groups (the grammar-per-namespace scope handles this, but cross-document is CHK-024)

## Dependencies

Blocked by CHK-017 (declarations with the attributes) and CHK-018 (content models the substituted elements participate in).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can substitution groups, nillable/abstract/final/block, and element default/fixed land on the declaration layer?

## Answer

Yes. They landed on the declaration layer (CHK-017) and content models (CHK-018) as part of the component graph, with the substitution-group hierarchy built at compile time (new pass 2a.5) and enforced at validation time. `blockDefault`/`finalDefault` schema defaults are also honored. A side fix was required: xmldom stores the default namespace under the `''` key, so unprefixed QName resolution (`lookupNamespaceURI(null)`) silently resolved to no-namespace; without fixing this, substitution groups (and refs) in target-namespaced schemas with a default `xmlns` could never resolve their heads.

## Decision / Outcome

Implemented in a single pass. All five acceptance criteria are met and verified by 33 unit tests in `src/lib/validator/compiled/declaration-attributes.test.ts` (test suite `Declaration attributes (CHK-023)`).

### Changes

**Component graph** (`src/lib/types/component-graph.ts`):
- `ElementDeclaration`: added `substitutionGroup`, `abstract`, `default`, `fixed`, `block`
- `ComplexTypeDefinition`: added `isAbstract`, `final`
- `SimpleTypeDefinition`: added `final`
- `CompiledGrammar`: added `substitutionGroups` (head local name → transitive members)
- `BUILTIN_GRAMMAR`: added `substitutionGroups: new Map()`, `final: ""` on all built-ins, `isAbstract: false, final: ""` on anyType

**Error taxonomy** (`src/lib/types/schema-error.ts`):
Added `ABSTRACT_ELEMENT`, `ABSTRACT_TYPE`, `BLOCKED_SUBSTITUTION`, `INVALID_NIL`, `FIXED_VALUE_VIOLATION`, `INVALID_FINAL`.

**Schema compiler** (`src/lib/xsd/compiler/schemaCompiler.ts`):
- Pass 1: reads `blockDefault`/`finalDefault` from the schema root; reads `substitutionGroup`/`abstract`/`default`/`fixed`/`block` on element declarations; `abstract`/`final` on complex types; `final` on simple types
- Pass 2a.5 (`buildSubstitutionGroups`): resolves affiliation refs, detects self/transitive cycles, computes transitive membership per head, enforces cos-element-decl-consistent (member type validly derived from head type)
- Pass 2 (resolveReferencePass): enforces cos-element-decl-props-correct (default+fixed mutual exclusion, value constraint requires simple content)
- Pass 3 (resolveSimpleTypes): enforces simple-type final (list/union/restriction)
- Pass 3b (validateDerivations): enforces complex-type final (extension/restriction)
- `readQNameString`: falls back to `lookupNamespaceURI("")` for unprefixed QNames so a declared default namespace is honored

**Instance validator** (`src/lib/validator/compiled/instanceValidator.ts`):
- `matches()`/`consumeMatchingChildren`: substitution-group-aware matching (head + transitive members), `BLOCKED_SUBSTITUTION` when the head's block forbids it
- `validateElement`: `ABSTRACT_ELEMENT`/`ABSTRACT_TYPE` reporting; nillable/xsi:nil handling (nil requires nillable, empty content, no fixed); fixed-value enforcement after type assessment
- `effectiveDeclaration()`: ref particles validate against their resolved global declaration (fixes abstract/block/nillable/identity-constraint behavior for `ref=` particles)
- Helpers: `substitutionMemberFor`, `blockIncludes`, `xsiNilRequested`, `enforceFixedValue`

### Known limitations
- `xsi:type` (the abstract-type escape hatch) is not yet implemented; a later ticket adds it
- `block="extension"`/`block="restriction"` are recorded but inert until `xsi:type` lands
- Fixed-value comparison is whitespace-normalized lexical, not value-space (e.g. `fixed="5"` vs `"05"` on xs:integer compares unequal); value-space equality is a datatype-layer concern
- The cross-namespace affiliation guard (head must be in the member's target namespace) is unreachable in single-document schemas until CHK-024

### Verification

`node scripts/agent-check.mjs full` passes: TEST_PASS (381 tests), BUILD_PASS, BENCHMARK_PASS, VALIDATE_PASS, GUARDRAILS_PASS.