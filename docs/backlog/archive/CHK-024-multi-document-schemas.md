---
id: CHK-024
title: "Multi-document schemas"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-017"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates `include`, `import`, and `redefine` `missing` — checkr is a single-document parser today. The ADR's grammar-per-namespace model (CHK-017) is the natural substrate: `xs:include` merges same-namespace schemas, `xs:import` creates foreign grammars, and `xs:redefine` augments existing components. `xsi:schemaLocation`/`xsi:noNamespaceSchemaLocation` let the instance document declare where to find schemas at validation time.

## Deliver

Multi-document schema assembly: `include` (same-namespace merge), `import` (cross-namespace grammar), `redefine` (augment), and runtime schema resolution via `xsi:schemaLocation`/`xsi:noNamespaceSchemaLocation`.

## Acceptance Criteria

- [x] `xs:include`: included documents merged into the same target namespace grammar; duplicate component detection
- [x] `xs:import`: imported namespace creates a foreign grammar; QName resolution crosses grammars
- [x] `xs:redefine`: components redefined with the spec's augmentation rules
- [x] `xsi:schemaLocation`/`xsi:noNamespaceSchemaLocation` honored at validation time, resolving to the correct grammar
- [x] Multi-document schemas compile and validate instances end-to-end

## Out of Scope

- Schema-for-schemas conformance checks on the assembled result (CHK-025)

## Dependencies

Blocked by CHK-017 (grammar-per-namespace foundation).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can multi-document schema assembly (include/import/redefine) and xsi:schemaLocation land on the grammar-per-namespace layer?

## Answer

Yes. The grammar-per-namespace layer (CHK-017) already supports cross-namespace lookups for QName references. The multi-document work extends it with:

- **`xs:include`**: The included document's globals register into the same grammar (same target namespace). Duplicate component definitions across the merged set are compile-time errors.
- **`xs:import`**: The imported document's globals register into a separate grammar keyed by its namespace. QName resolution (pass 2) already crosses grammars, so `ref=` and `type=` references into imported namespaces resolve automatically.
- **`xs:redefine`**: Redefines a same-namespace document's components. The redefined document is registered first (so its components exist in the grammar), then the redefinitions are built with a `refRewrite` sentinel mechanism: references to the redefined name inside the redefine element (e.g. `base="T"` in the augmentation pattern) are routed to the original component via a `__checkr_redefine_{name}` sentinel key, while references elsewhere resolve to the redefinition. The redefinition replaces the original in the grammar.
- **`xsi:schemaLocation`/`xsi:noNamespaceSchemaLocation`**: At validation time, the root element's hints are checked against the compiled schema's grammars. A hint declaring a namespace with no corresponding grammar is reported as `SCHEMA_LOCATION_UNRESOLVED`. Hints are the only xsi: attribute that is *checked* rather than merely ignored (xsi:type, xsi:nil are handled per earlier tickets).

## Decision / Outcome

Implemented in a single pass. All five acceptance criteria are met and verified by 24 unit tests in `src/lib/xsd/compiler/multi-document.test.ts` (test suite `CHK-024`).

### Changes

**`src/lib/types/schema-error.ts`** — added `SCHEMA_LOCATION_UNRESOLVED` error code for unresolvable schemaLocation hints (compile-time resolver failure or validation-time grammar mismatch).

**`src/lib/xsd/compiler/schemaCompiler.ts`** — major additions:
- `CompileOptions` gained `resolve?: (location: string) => string | null` for multi-document schema resolution.
- `BuildContext` gained `grammarsByNamespace: Map<string, MutableGrammar>` (all grammars in the schema set) and `refRewrite: ((q: QName) => QName) | null` (for redefine auto-resolve).
- `compile()` now calls `registerSchemaSet()` instead of a fixed pass-1 loop.
- `registerSchemaSet()` owns the multi-document worklist: it processes the root document, then recursively discovers `include`, `import`, and `redefine` children. Cycle detection uses location-based tracking. The resolver is a caller-provided callback.
- `registerGlobals()` replaces the inline pass-1 loop, with duplicate-component detection via `registerComponent()`.
- `AdoptDocument/snapshotDefaults/restoreDefaults` manage per-document context (target namespace, forms, defaults) during recursive document registration.
- `RedefineCategory` + `redefineCategory()` helper map the four XSD 1.0 redefinable kinds to their grammar maps.
- `buildRedefinition()` builds the replacement component and overwrites the grammar entry.
- `buildSubstitutionGroups()` updated for multi-grammar: members are keyed by full QName to avoid cross-namespace collisions, and per-grammar transitive closure replaces the single-grammar version.
- `readQName()`/`readQNameString()` gained a `ctx` parameter and apply `refRewrite` when active.

**`src/lib/validator/compiled/instanceValidator.ts`**:
- `validate()` now calls `checkSchemaLocationHints()` after root-element resolution to validate `xsi:schemaLocation`/`xsi:noNamespaceSchemaLocation` against the compiled schema's grammars.

**`src/lib/xsd/compiler/multi-document.test.ts`** (new): 24 tests covering:
- `xs:include`: same-namespace merge, end-to-end validation, namespace mismatch, no resolver, duplicate detection, circular include
- `xs:import`: foreign grammar existence, cross-grammar QName resolution, end-to-end validation, namespace mismatch, self-import error, no-location no-op
- `xs:redefine`: complex type augmentation, undefined name error, illegal kind error, duplicate redefinition error, simple type redefinition
- `xsi:schemaLocation`: valid hint, missing grammar, noNamespaceSchemaLocation missing, noNamespaceSchemaLocation valid
- Combined: include + import + redefine end-to-end with conforming and non-conforming instances

### Edge cases documented

- **Unprefixed QName refs require a default `xmlns` declaration**: per the existing codebase (and XSD 1.0), unprefixed QName attribute values without a default namespace in scope resolve to the null namespace. The `refRewrite` sentinel check matches on namespace, so an unprefixed `base="Base"` in a target-namespaced schema without `xmlns="urn:t"` will not be rewritten and will cause `UNRESOLVED_TYPE`. Tests include the required `xmlns="urn:t"`.
- **Same-location dedup**: a document location processed once is skipped on subsequent encounters (idempotent — its components are already in the grammar). The worklist tracks processing vs. processed sets for cycle detection.
- **Redefine scoping**: only references *inside the redefine element* (the redefinition children) are rewritten to the sentinel. References to the redefined name from the redefining document's other definitions, or from other documents, resolve to the replacement (redefinition) component. This is the XSD 1.0 §4.2.3 behavior: the augmentation pattern's `base="T"` gets the original, while all other uses see the augmented version.

### Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

Both pass.