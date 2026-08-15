---
id: CHK-009
title: "Contract the flat model"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-008"]
required_context: ["src/lib/", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/gap-analysis.md"]
assignee: null
estimate: null
---

## Context

With the component-graph core (CHK-008) landed, the old flat model (`XSDElement` bag-of-fields, its pipeline steps, type-reference resolver, and validator walk) is dead weight: it is the substrate the gap analysis found incapable of expressing the XSD 1.0 component model. This ticket deletes it and migrates all call sites onto the new two-phase API — the contract step of the rearchitecture sequence.

## Deliver

The old flat-model pipeline fully removed; tests, benchmark, and README migrated to the new API; CI green on the new surface only.

## Acceptance Criteria

- [ ] The old flat model, its parse-pipeline steps, resolver, and validator walk are deleted
- [ ] All call sites (tests, benchmark, README, public exports) use the two-phase API
- [ ] Tests retired for behavior the new surface does not yet cover are listed in the ticket outcome, so feature tickets can re-cover them deliberately
- [ ] `test`, `build`, and `guardrails` checks pass

## Out of Scope

- Re-implementing behavior the old pipeline had — that is the feature slices (CHK-010 onwards), which restore and improve it on the graph

## Dependencies

Blocked by CHK-008 (the new surface must exist before the old one is deleted).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
node scripts/agent-check.mjs guardrails
```

## Question

Can the old flat model be deleted and the repository migrate to the new API with CI green on the new surface?

## Answer

**Yes** — the old flat model is deleted and the repository runs on the two-phase API only, with all four verification gates green.

The deletion removed the `XSDElement` bag-of-fields (`src/lib/types/xsd.ts`, `src/lib/types/validation.ts`), the parse pipeline (`src/lib/xsd/pipeline/**`), the flat type-reference resolver (`src/lib/xsd/resolvers/**`), the document extractor (`src/lib/xsd/utils/**`), the validator walk (`src/lib/validator/pipeline/**`, `src/lib/validator/validator.ts`), and the single-shot `Checkr` composition root (`src/lib/core/main.ts`). The public surface (`src/index.ts`), the benchmark, and the README now expose only `compileSchema` / `validate` and the `SchemaError` / component-graph types.

Tests whose behavior the new surface covers were migrated or were already covered by the CHK-008 suite; the remainder were retired deliberately and are itemized in Decision/Outcome so feature tickets (CHK-010 onwards) re-cover them on the graph.

## Decision / Outcome

### What was deleted

- **Flat model types**: `src/lib/types/xsd.ts` (`XSDElement`, `XSDSchema`, …), `src/lib/types/validation.ts` (`ValidationResult`, pipeline-step signatures)
- **Parse pipeline**: `src/lib/xsd/pipeline/**` (parser, `PipelineImpl`, `ElementAssembler`, steps: rootElement, enumeration, attributes, nestedElement, restriction, extension)
- **Flat resolver**: `src/lib/xsd/resolvers/**` (`ModularTypeReferenceResolver`, modules: ElementResolver, PropertyMerger, ResolutionCache, TypeExtender, TypeRegistry, TypeResolver, TypeRestrictor)
- **Document extraction**: `src/lib/xsd/utils/documentExtractor.ts`
- **Validator walk**: `src/lib/validator/pipeline/**` (global/node pipelines and all steps: abstract, attributes, constraints, occurence, requiredChildren, rootElements, type), `src/lib/validator/validator.ts` (`ValidatorImpl`)
- **Single-shot root**: `src/lib/core/main.ts` (`Checkr`)
- **Stale doc**: `docs/type-system.md` described only the deleted resolver/pipeline; superseded by `docs/adr/architecture-component-model.md`

### What was migrated

- `src/index.ts` — public exports are now the two-phase surface only (`compileSchema`, `validate`, `CompileOptions`, `ValidateOptions`, `SchemaCompilationError`, `SchemaError` taxonomy, component-graph types).
- `src/benchmark/run.ts` — compiles the books schema once, then validates the fixture N times against the immutable `CompiledSchema` (the compile-once/validate-many pattern the XSTS runner will use); the fixture `books.xml` was non-conforming (bk002 lacked `pub_date`) and was fixed so the benchmark measures a conforming instance.
- `README.md` — usage, features, architecture, and supported-feature sections rewritten for the two-phase API.
- End-to-end tests: the books scenario (conforming + missing-element instances) moved into `src/lib/core/compiled.test.ts` as a migrated describe block. The simple/named variants were already covered by the CHK-008 suite (`instanceValidator.test.ts` minimal round trip + namespaces). `src/lib/xml/parser.test.ts` was kept — the xml layer is shared infrastructure, not part of the flat model.

### Tests retired (behavior the new surface does not yet cover) — re-cover deliberately in feature tickets

| Retired behavior | Old tests | Re-cover in |
|---|---|---|
| Lexical type validation (`xs:integer`, `xs:date` value checking) | `validator/pipeline/steps/type.test.ts`, `validator/validator.test.ts` | CHK-012 (numeric family), CHK-013 (date/time family) |
| Facet enforcement (enumeration, pattern, minLength/maxLength) | `validator/pipeline/steps/constraints.test.ts`, `validator/validator.test.ts` | CHK-010 (facet framework), CHK-011 (string family) |
| Fixed attribute-value enforcement | `validator/pipeline/steps/attributes.test.ts`, `validator/validator.test.ts` | CHK-010 |
| `xs:choice` content-model validation (old greedy walk) | `validator/validator.test.ts` | CHK-018 (content models: sequence, choice, all) |
| Abstract-element rejection (`validateAbstract` step) | `validator/pipeline/steps/abstract.ts` | CHK-023 (substitution groups / declaration attributes) |
| Flat parse surface (min/maxOccurs defaults, whitespace in attribute and enumeration values, inline nested complexTypes, prefixed names) | `xsd/parser.test.ts`, `xsd/pipeline/**` tests | Re-expressed in graph terms by the feature slices; whitespace/normalization policy → CHK-011 |
| Flat type-reference resolution (copy BookForm children onto `book`) | `xsd/resolvers/**` tests | Superseded by eager multi-pass graph resolution — already covered by `schemaCompiler.test.ts`; the copy-children semantics are obsolete by design |
| Global occurrence / root-element checks over flat element lists | `validator/pipeline/steps/occurence.test.ts`, `requiredChildren.test.ts`, `rootElements.ts` | Particle counts covered by `instanceValidator.test.ts`; required-children covered by `MISSING_REQUIRED_ELEMENT`; element-list matching semantics obsolete |

### Verification

```
node scripts/agent-check.mjs test         → TEST_PASS
node scripts/agent-check.mjs build        → BUILD_PASS
node scripts/agent-check.mjs benchmark    → BENCHMARK_PASS
node scripts/agent-check.mjs guardrails   → GUARDRAILS_PASS
node scripts/agent-check.mjs validate-brief → VALIDATE_PASS (after this brief was finalized)
```
