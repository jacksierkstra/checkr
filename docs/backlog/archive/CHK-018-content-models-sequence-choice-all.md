---
id: CHK-018
title: "Content models: sequence, choice, all"
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

Implemented `sequence`, `choice`, and `all` compositors with correct ordering, per-particle occurrence in context, and compile-time UPA rejection:

### Compile-time changes

- **New module `src/lib/xsd/content-model.ts`**: Position-automaton (Glushkov) construction for UPA determinism checking per XSD 1.0 §3.8.6. Uses first/last/follow sets and subset-construction to detect ambiguous content models. Handles element particles and wildcard particles (conservative `##any` representation for now).
- **New error code `AMBIGUOUS_CONTENT_MODEL`** in `SchemaErrorCode` for compile-time UPA violations.
- **All-group occurrence validation**: `xs:all` minOccurs/maxOccurs must be 0/1, children must have maxOccurs=1. Violations are compile-time errors.
- **UPA checks** run in `checkContentModelUPA` inside `buildComplexType` after building each content model particle, reporting errors via the listener.
- **All-group validation** runs in `validateAllGroup` during compilation.

### Instance-validator changes

- **`validateSequence` → `validateSequenceOnce`**: Refactored to return consumed-child count for use by the repeating-group wrapper. Properly handles nested groups (sequence/choice/all) within sequences by dispatching through `consumeMatchingChildren`, which recursively handles element and group particles. Non-matching nullable particles skip forward.
- **`validateChoiceOnce`**: Implements exactly-one-alternative semantics. First matching branch consumes its children; non-matching branches and remaining children are reported as unexpected by the parent (`validateRepeatingGroup`).
- **`validateAllOnce`**: Implements unordered content semantics per XSD 1.0 §3.8.4. Each particle matches at most one child (maxOccurs=1); children can appear in any order; required children (minOccurs>0) reported missing if absent.
- **`validateRepeatingGroup`**: Handles particle-occurrence wrappers around groups (minOccurs/maxOccurs, repeating via maxOccurs>1 or unbounded). Greedy matching: repeatedly calls `validateGroupOnce` until children exhausted or maxOccurs reached.
- **`consumeMatchingChildren`**: Core dispatcher that consumes children matching a particle — element particles use name-based matching and validate via `validateElement`; group particles dispatch to the appropriate `validateXxxOnce`.

### Validation implemented

- **`sequence`**: Child order enforced; each particle's minOccurs/maxOccurs checked per-parent context; nested sequences/choices compose correctly.
- **`choice`**: Exactly-one-within-context semantics; occurrence bounds on the choice itself handled by the wrapper.
- **`all`**: Unordered content with spec's occurrence limits (0/1); distinct child names required (UPA).
- **UPA violations** are compile-time errors: choice with overlapping element names, sequence with nullable/repeatable-first overlapping particles, all with duplicate names. Non-nullable non-repeatable overlapping sequence particles (like (a, a)) are accepted as UPA-valid per the one-unambiguous language definition.
- **Nested compositors** compose per spec: sequence containing choice, choice containing sequence, nested sequences, etc.