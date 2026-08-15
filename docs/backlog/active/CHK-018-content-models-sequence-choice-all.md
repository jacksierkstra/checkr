---
id: CHK-018
title: "Content models: sequence, choice, all"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-017"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates model groups `partial` but with fatal defects for XSTS passage: sequence order is never enforced (presence-only), choice counts document-wide instead of per-parent, occurrence is context-blind, and `xs:all` is unparsed. This ticket delivers correct particle semantics — the structures side's largest single scoring surface (Particles 856 + ModelGroups 391 groups).

## Deliver

`sequence`, `choice`, and `all` compositors with correct ordering, per-particle occurrence in context, and UPA/ambiguity rejection at compile time.

## Acceptance Criteria

- [ ] `sequence`: child order enforced; each particle's `minOccurs`/`maxOccurs`/`unbounded` checked in its parent context, not document-wide
- [ ] `choice`: exactly-one-within-context semantics with occurrence bounds on the choice itself
- [ ] `all`: unordered content semantics with the spec's occurrence limits
- [ ] Nested compositors compose per spec
- [ ] UPA violations and ambiguous content models are compile-time errors
- [ ] A Particle-test-set-style schema/instance pair (unbounded repeats, interleaved choice) validates correctly

## Out of Scope

- Named model groups (CHK-019)
- Complex-content derivation (CHK-020)

## Dependencies

Blocked by CHK-017 (declarations and namespace-correct matching the particles reference).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can sequence/choice/all particle semantics land with per-context occurrence and compile-time UPA checks?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*