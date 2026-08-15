---
id: CHK-006
title: "Decide test runner architecture for XSTS"
type: "ticket"
wayfinder_type: "grilling"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-002", "CHK-004"]
required_context: ["docs/research/xsts-structure-acquisition.md", "docs/adr/architecture-component-model.md"]
optional_context: []
assignee: null
estimate: null
---

## Context

The XSTS (W3C XML Schema Test Suite) is a large collection of test cases (~2000+ across Parts 1 and 2). To measure checkr's XSD 1.0 spec compliance, we need a test runner in a separate TypeScript repo under @jacksierkstra that installs checkr as a dependency and runs the XSTS cases through it. The checkr API is now defined by the architecture decision (CHK-004): `compileSchema()` → `CompiledSchema`, then `validate()` → `ValidationResult`. The runner needs to parse XSTS manifests, feed cases through checkr, compare results, and report progress.

## Must Follow

Follow the grilling skill protocol: conversation, one question at a time.

## Do Not

Do not implement the test runner. Produce a decision, not a deliverable.

## Deliver

A markdown document `docs/research/test-runner-design.md` that specifies:

1. How the runner discovers and parses XSTS manifests (`.testSet`, `.xml` files)
2. How each test case is run through checkr (schema compilation → instance validation per the two-phase API)
3. How expected outcomes are compared against actual results (`valid`, `invalid`, `implementation-defined`)
4. How `implementation-defined` and `implementation-dependent` outcomes are handled
5. The runner's API surface — CLI tool, library, or both
6. How progress is reported (pass/fail/skip counts, per-test-group breakdown)
7. How the runner is versioned and maintained alongside checkr

## Acceptance Criteria

- [ ] The design document is linked from this ticket's Answer
- [ ] All seven areas above are covered
- [ ] Each decision is justified with reference to XSTS manifest structure (CHK-002) and checkr's API (CHK-004)

## Out of Scope

- Implementation of the test runner
- Feature gap analysis (that's CHK-005)
- Running the XSTS or any tests

## Dependencies

Depends on CHK-002 (XSTS structure and acquisition) and CHK-004 (architecture decision — defines checkr's API boundary).

## Verification

```
ls docs/research/test-runner-design.md
```

## Question

How should the XSTS test runner be designed — what's its architecture (manifest parsing, case execution, outcome comparison, reporting), its API surface (CLI, library, or both), and its versioning relationship with checkr?

## Answer

*(to be filled on resolution)*