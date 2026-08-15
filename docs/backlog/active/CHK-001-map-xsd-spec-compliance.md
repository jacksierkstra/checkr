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

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

*(none — the scheduling question is now ticketed as CHK-007 — Decide feature implementation order)*

## Out of scope

<!-- work ruled beyond the destination; closed, never graduates -->

*(none yet)*