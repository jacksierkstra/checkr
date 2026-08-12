---
id: CHK-001
title: "XSD 1.0 Spec Compliance — Wayfinder Map"
type: "map"
area: "meta"
priority: "high"
status: "draft"
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

*(none yet)*

## Not yet specified

- **Test runner design** — Once we understand the XSTS format, we need to decide: how does the runner parse manifests, feed cases through checkr, compare results, and report progress? What's the API surface? Should it be a CLI tool, a library, or both? This is blocked on [Research the XSTS structure and acquisition](#CHK-002).
- **Architecture decision** — The component model for checkr's internals. What schema components (element declarations, type definitions, model groups, identity constraints, etc.) do we need? How do they reference each other? This is blocked on [Research reference XSD validator architectures](#CHK-003).
- **Gap analysis** — A detailed feature-by-feature comparison of checkr's current capabilities against the XSTS. Which features are missing, which are incomplete, which are correct? Blocked on both XSTS research and architecture research.
- **Feature implementation order** — Once we have the architecture and gap analysis, in what order should features be implemented to maximize early progress on the XSTS? This is a scheduling decision, blocked on the gap analysis.
- **Schema validation infrastructure** — Currently checkr doesn't validate schemas at all. We need to decide: validate against the schema-for-schemas (XSD spec), or use a simpler conformance check? Blocked on architecture decision.

## Out of scope

<!-- work ruled beyond the destination; closed, never graduates -->

*(none yet)*