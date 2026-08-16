---
id: CHK-026
title: "Notations and annotations"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "medium"
status: "done"
depends_on: ["CHK-008"]
required_context: ["docs/research/gap-analysis.md"]
optional_context: ["docs/adr/architecture-component-model.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates notations `missing` and annotations `partial (inert)`. The `Notations_w3c.xml` set (116 groups) exercises notation declarations and their interplay with `NOTATION`-typed values; `Annotations_w3c.xml` (80 groups, 0 instance tests) is effectively inert — annotations have no validity effect. This ticket parses both into the graph and wires the notation ↔ NOTATION-type link.

## Deliver

Notation declarations in the component graph, wired to `NOTATION`-typed values (CHK-014), and annotation parsing with no validity effect.

## Acceptance Criteria

- [ ] `xs:notation` declarations compile into the graph with name, public and system identifiers
- [ ] `NOTATION`-typed values (from CHK-014) reference a declared notation; undeclared notations are validation errors
- [ ] `xs:annotation`/`xs:documentation`/`xs:appinfo` parse and attach to their parent component without affecting validity
- [ ] Annotations-only tests (which verify no validity effect) pass vacuously

## Out of Scope

- The full NOTATION value space (lexical form is in CHK-014; this ticket wires the declaration link)

## Dependencies

Blocked by CHK-008 (component-graph core).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can notations and annotations land in the component graph with the notation↔NOTATION-type link?

## Answer

Yes — notations and annotation parsing land on the component graph alongside the notation↔NOTATION-type link:

- **Notation declarations** (`xs:notation`) compile into the target-namespace grammar's `notations` map with `name`, `public`, and `system` identifiers. Duplicate names are compile errors; at least one of `public`/`system` is required per `notation-props-correct`.
- **NOTATION↔type link**: at instance-validation time, any value whose type (walking the base chain) derives from `xs:NOTATION` is resolved as a QName against the instance element's in-scope namespaces, and the resolved QName must match a declared notation. An undeclared notation produces `UNDECLARED_NOTATION` (new error code).
- **Annotations** (`xs:annotation`/`xs:documentation`/`xs:appinfo`) are parsed and attached to their parent component (named globals: element, attribute, complexType, simpleType, group, attributeGroup, notation, identity constraint; plus schema-level annotations on `CompiledSchema`). Annotations are inert — they never affect validity. Annotations in local positions (particles, attribute uses, facets) are silently tolerated.

## Decision / Outcome

**Completed (CHK-026).**

**Files:**
- `src/lib/types/component-graph.ts` — new `AnnotationItem`, `Annotation`, `NotationDeclaration` types; `annotations` field on `SimpleTypeDefinition`, `ComplexTypeDefinition`, `ElementDeclaration`, `AttributeDeclaration`, `ModelGroupDefinition`, `AttributeGroupDefinition`, `IdentityConstraintDefinition`, `NotationDeclaration`; `notations` on `CompiledGrammar`; `annotations` on `CompiledSchema`.
- `src/lib/types/schema-error.ts` — new error code `UNDECLARED_NOTATION`.
- `src/lib/xsd/compiler/schemaCompiler.ts` — `MutableGrammar.notations`; `buildNotation()`; `parseAnnotations()` helper; `annotations:` populated at every component construction site; schema-level annotations on `compile()` return; `case "notation"` in `registerGlobals`; `"notations"` in `registerComponent` mapName union.
- `src/lib/xsd/compiler/builtinTypes.ts` — `notations: new Map()` on `BUILTIN_GRAMMAR`; `annotations: []` on builtin types.
- `src/lib/validator/compiled/instanceValidator.ts` — `derivesFromNotation()` and `resolveValueQName()` helpers; NOTATION value-space check in `checkAtomicValue`; `node`/`schema` threaded through value-checking pipeline.
- `src/lib/xsd/compiler/notations-annotations.test.ts` — new file (27 tests covering notation compilation, NOTATION value-space, annotation parsing, XSTS annotations-only pass-through).
- `src/lib/validator/compiled/instanceValidator.test.ts` — updated existing NOTATION lexical test to also cover the declaration link.

**Acceptance criteria:**
- [x] `xs:notation` declarations compile into the graph with name, public and system identifiers.
- [x] `NOTATION`-typed values reference a declared notation; undeclared notations are `UNDECLARED_NOTATION` validation errors.
- [x] `xs:annotation`/`xs:documentation`/`xs:appinfo` parse and attach to their parent component without affecting validity.
- [x] Annotations-only tests (which verify no validity effect) pass vacuously (schema with annotations on every global component compiles and validates clean).