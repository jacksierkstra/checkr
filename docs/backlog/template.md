---
id: CHK-000
title: ""
area: ""
priority: ""
status: "draft"
depends_on: []
required_context: []
optional_context: []
estimate: null
---

## Context

Why this task exists. What problem does it solve? Link to any relevant prior work.

## Must Follow

Task-specific constraints. Do not restate global rules from AGENTS.md.

## Do Not

Boundaries the task must not cross. Things the task is explicitly not doing.

## Deliver

What this task produces. A file, a refactor, an ADR, a decision.

## Acceptance Criteria

- [ ] Bullet list of observable, testable outcomes.
- [ ] Each must be verifiable by a script or a human reading a diff.

## Out of Scope

Things deliberately left for later.

## Risks

What could go wrong, and what mitigations are in place.

## Dependencies

Other briefs, external systems, or information needed before starting.

## Verification

Runnable commands that prove the acceptance criteria are met. Written before implementation.

```
node scripts/agent-check.mjs test
```

## Decision / Outcome

*(filled in after completion)*

What was decided, what was learned, why alternatives were rejected. This is the only thing future tasks read from this brief.