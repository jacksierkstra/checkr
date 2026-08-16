---
id: CHK-001
title: "XSD 1.0 Spec Compliance — Wayfinder Map"
type: "map"
area: "meta"
priority: "high"
status: "in-progress"
depends_on: []
required_context: []
optional_context: []
estimate: null
---

## Context

Checkr is a TypeScript XML validation library that currently supports basic-to-intermediate XSD 1.0 features. The goal of this effort is to bring checkr to full XSD 1.0 spec compliance, measured by passing the W3C XML Schema Test Suite (XSTS) for both Part 1 (Structures) and Part 2 (Datatypes), covering both schema validation and instance validation.

## Must Follow

Follow the Wayfinder protocol: this map is the index, decisions live in their tickets. Never resolve more than one ticket per session.

## Do Not

Do not implement features directly as part of this planning effort. Produce decisions, not deliverables, unless the map's Notes section explicitly overrides this.

## Deliver

A shared map of tickets that, when resolved, charts a clear route from checkr's current state to passing the XSTS.

## Acceptance Criteria

- [ ] The map is complete: all major decisions and investigations needed to reach the destination are ticketed or explicitly in the fog.
- [ ] The final resolved ticket leaves no open decisions — the route to implementation is clear.

## Out of Scope

- Implementation of the features themselves (that's the handoff after the map is complete)
- XSD 1.1 features

## Risks

- The XSTS is large (~2000+ tests) and may contain test-suite bugs or ambiguity that slow progress
- The architecture gap may be larger than anticipated, requiring multiple rearchitecture efforts
- The test runner repo is a separate project that needs design and maintenance

## Verification

```
# No direct verification — this is a planning map. Verification happens per ticket.
```

## Destination

Pass the W3C XML Schema Test Suite (XSTS) for XSD 1.0, Parts 1 and 2 — both schema validation and instance validation — with a clean test runner in a separate TypeScript repo under @jacksierkstra.

## Notes

- **Domain**: XSD 1.0 spec compliance, XML Schema validation, W3C test suite
- **Skills per session**: grilling, domain-modeling, research, prototype, tdd — consult these as needed
- **Architecture policy**: rearchitect checkr's internals when needed; don't force-fit features into the current pipeline model
- **Test runner**: separate TypeScript repo under @jacksierkstra, installs checkr as a dependency, runs across multiple checkr versions
- **No deadlines** — work through the map at whatever pace
- **Plan, don't do**: produce decisions, not deliverables, until the map is complete

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Research reference XSD validator architectures](docs/backlog/archive/CHK-003-reference-architectures.md) — Xerces-J uses a grammar-per-namespace component model; libxml2 uses a flat struct model. Both share a two-phase architecture (schema compilation → instance validation) with eager multi-pass reference resolution. The full analysis covers all seven research questions and includes a summary of design recommendations.
- [Decide checkr's XSD component model architecture](docs/backlog/archive/CHK-004-architecture-decision.md) — ADR at `docs/adr/architecture-component-model.md`: checkr adopts a typed component graph (discriminated union mirroring XSD Part 1 components) with a two-phase API (`compileSchema` → immutable `CompiledSchema` → `validate`). QName `{ns}localName` identity; grammar-per-namespace; eager multi-pass resolution (unresolved refs = compile errors); `SchemaError` taxonomy via listener; schema-for-schemas validation at compile time; no formal PSVI but internal hooks kept. This also settles the schema-validation-infrastructure fog entry: schema-for-schemas, at compile time.
- [Gap analysis: checkr capabilities vs XSTS](docs/backlog/archive/CHK-005-gap-analysis.md) — Full analysis at `docs/research/gap-analysis.md`: no feature area is `full`; the flat pipeline model blocks everything until the CHK-004 rearchitecture. Partial: schema element/forms, element & attribute declarations, sequence/choice, particles (with known bugs: root `unbounded` → 1, document-wide occurrence counts), 4 facets (string-only), 5 lexical type regexes (so `xs:float` and ~39 other built-ins are unvalidated). Missing: `all`, named groups, attribute groups, wildcards, identity constraints, notations, list/union, complex/simple-content derivation, substitution groups, `nillable`/`xsi:*`, refs, include/import/redefine, schema-for-schemas, XSD regex. ~60% of the suite's ~14,383 groups are datatypes + regex; implementation-defined policy recorded (CTR-with-`all` → `CTR-all-compile` recommended, XML 1.0, JS-runtime Unicode with code-point counting).
- [Two-phase API and component-graph core](docs/backlog/archive/CHK-008-two-phase-api-component-graph-core.md) — The foundation landed beside the legacy pipeline: `compileSchema()` → deep-frozen `CompiledSchema` (grammars keyed by namespace, QName identity) and `validate()` → `SchemaValidationResult`, with the `SchemaError` taxonomy (severity/code/message/location/phase) via listener; pass-1-register/pass-2-resolve eager multi-pass resolution, forward references work, unresolvable refs are compile errors (`SchemaCompilationError` throws after listener delivery); built-ins registered but not lexically validated; sequence content matching (greedy, no lookahead), `choice`/`all`/wildcards/`complexContent`/`ref=` compile with warnings and report `UNSUPPORTED_FEATURE` at validation; `elementFormDefault` honoured. Old single-shot API untouched, 182 tests green.
- [Simple-type definitions and facet framework](docs/backlog/archive/CHK-010-simple-type-definitions-facet-framework.md) — The facet framework landed on the component graph: `SimpleTypeDefinition` carries `baseType`, effective `whiteSpace` (preserve/replace/collapse per §4.3.6) and `effectiveFacets` after restriction-chain inheritance; `length`/`minLength`/`maxLength` count code points via `Array.from` (supplementary characters correct); enumeration enforced; new `FACET_VIOLATION` error code; attribute values and simpleContent text validated too; built-ins got whiteSpace values + base chains (string/numeric families). Numeric bounds (CHK-012) and `pattern` (CHK-015) attached but not evaluated. Unblocks CHK-011–016.
- [Named model groups and attribute groups](docs/backlog/archive/CHK-019-named-model-groups-attribute-groups.md) — `xs:group` and `xs:attributeGroup` definitions compile into the graph; `ref=` expands into particles/attribute uses via eager multi-pass resolution; forward references work; circular references are compile-time errors (`CIRCULAR_REFERENCE`); `xs:all` rejects group-ref children (XSD 1.0 restriction). `consumeMatchingChildren` fixed to honour group-particle occurrence via `validateRepeatingGroup` delegation, with error suppression for nulled matches.
- [Wildcards](docs/backlog/archive/CHK-021-wildcards.md) — `xs:any`/`xs:anyAttribute` land on the declaration layer: `Wildcard` carries a normalized `{namespace constraint}` (any/other/uris-set, `##targetNamespace`/`##local` resolved at compile time), `ComplexTypeDefinition`/`AttributeGroupDefinition` carry an `attributeWildcard`, and the §3.10.6 set algebra lives in `src/lib/xsd/wildcards.ts`. Instance validation enforces the constraint with `processContents` strict/lax/skip for both elements and attributes; derivation implements attribute-wildcard union (extension) and subset + processContents ordering (restriction), plus particle restriction rules (Wildcard:Wildcard, Elt:Wildcard, no wildcard-over-element). UPA uses the real constraints. Wildcards in `xs:all` stay a compile error (XSD 1.1). Unblocks CHK-022/CHK-023.
- [Multi-document schemas](docs/backlog/archive/CHK-024-multi-document-schemas.md) — include/import/redefine land on the grammar-per-namespace layer: `compileSchema` gained a `resolve` option (schemaLocation → XSD content); `registerSchemaSet` runs the document worklist (same-namespace include merge with duplicate detection, foreign grammars for import, redefine with a sentinel/ref-rewrite mechanism so the augmentation pattern's `base="T"` resolves to the original while everything else sees the replacement), with location-based cycle detection. `xsi:schemaLocation`/`xsi:noNamespaceSchemaLocation` are honored at validation time (`SCHEMA_LOCATION_UNRESOLVED` when the declared namespace has no grammar). Substitution groups recomputed per grammar (full-QName member keying). Unblocks CHK-025/CHK-027/CHK-028.
- [Errata 1.0 sweep](docs/backlog/archive/CHK-027-errata-1-0-sweep.md) — the full Errata10 set (19 groups, 31 schema/instance pairs) passes with no deliberate divergences. Four behaviors changed: local element `abstract` prohibited (E1-13, `INVALID_DECLARATION`), duration `T` with no time components rejected (E2-24), `xs:anyType` gets a `##any, lax` wildcard particle + attribute wildcard so untyped content validates lazily (E1-22/R-117), and `gMonth` lexical corrected to `--MM[--](Z|±hh:mm)` (E2-22). In-repo derived regression fixtures in `src/lib/xsd/compiler/errata.test.ts`.

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

*(none — the scheduling question is now ticketed as CHK-007 — Decide feature implementation order)*

## Out of scope

<!-- work ruled beyond the destination; closed, never graduates -->

*(none yet)*