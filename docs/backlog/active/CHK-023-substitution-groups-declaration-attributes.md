---
id: CHK-023
title: "Substitution groups and declaration attributes"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-017", "CHK-018"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates substitution groups, `nillable`/`xsi:nil`, `abstract`/`final`/`block`, and element `default`/`fixed` all `missing`. These are declaration-level attributes that control instance-validation behavior: which elements are accepted (substitution groups), whether an element can be nil, whether a type can be used directly, and whether default values are injected. They sit on the declaration layer (CHK-017) and content models (CHK-018).

## Deliver

Substitution-group hierarchy with transitive head/member resolution, `abstract`/`final`/`block` enforcement, `nillable` + `xsi:nil` handling, and element `default`/`fixed`.

## Acceptance Criteria

- [ ] Substitution group heads declared with `<xs:element … substitutionGroup="…">`; members accepted in place of the head at validation time, including transitive membership
- [ ] `abstract="true"` elements/types rejected when instantiated directly; non-abstract members accepted
- [ ] `final`/`block` constraints on types and elements enforced
- [ ] `nillable="true"`: element accepted with `xsi:nil="true"` and empty content; `xsi:nil` on non-nillable rejected
- [ ] Element `default` injected when the instance element is absent; `fixed` enforced against the instance value
- [ ] A substitution-group test (Element set) validates end-to-end

## Out of Scope

- Multi-document substitution groups (the grammar-per-namespace scope handles this, but cross-document is CHK-024)

## Dependencies

Blocked by CHK-017 (declarations with the attributes) and CHK-018 (content models the substituted elements participate in).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can substitution groups, nillable/abstract/final/block, and element default/fixed land on the declaration layer?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*