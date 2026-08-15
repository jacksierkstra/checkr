---
id: CHK-019
title: "Named model groups and attribute groups"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-018"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates named model groups (`xs:group`) and attribute groups (`xs:attributeGroup`) `missing` — neither is parsed, and their contents vanish. Group references (`Group_w3c.xml` 218 groups, `AttributeGroup_w3c.xml` 114 groups) are pure compile-time expansion work on the component graph.

## Deliver

Global `xs:group` and `xs:attributeGroup` definitions compiling into the graph, with `ref=` expansion into particles and attribute uses, forward references resolved, and circular references rejected.

## Acceptance Criteria

- [ ] Global model group definitions compile; `<xs:group ref="…">` expands into particles with correct occurrence
- [ ] Global attribute group definitions compile; `<xs:attributeGroup ref="…">` expands into attribute uses
- [ ] Forward references resolve via the eager multi-pass resolution (ADR §5)
- [ ] Circular group/attribute-group references are compile-time errors
- [ ] A schema using named groups validates the same instances as the equivalent inlined schema

## Out of Scope

- Content-model semantics (CHK-018 provides them; this expands on top)
- Multi-document assembly (CHK-024)

## Dependencies

Blocked by CHK-018 (the particle machinery groups expand into).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can named model groups and attribute groups land as compile-time expansion on the graph?

## Answer

Named model groups and attribute groups can land as compile-time expansion on the graph.

## Decision / Outcome

Implemented named model groups (`xs:group`) and attribute groups (`xs:attributeGroup`) as compile-time expansion on the component graph:

### Component-graph types
- **`ModelGroup.ref`**: New field (`QName | null`) on `ModelGroup` — set for placeholder groups produced by `<xs:group ref="…">`, cleared after pass-2 expansion.
- **`ModelGroupDefinition`**: New interface (`kind: "model-group-definition"`) holding a named group definition with its particle tree.
- **`AttributeGroupDefinition`**: New interface (`kind: "attribute-group-definition"`) holding a named attribute group with its attribute uses.
- **`AttributeUse.attributeGroupRef`**: New field (`QName | null`) — set for placeholder uses produced by `<xs:attributeGroup ref="…">`.
- **`CompiledGrammar`**: Added `modelGroups` and `attributeGroups` readonly maps.

### Schema compiler (pass-1 registration)
- Global `<xs:group name="…">` parsed in pass 1, stored in `grammar.modelGroups`.
- Global `<xs:attributeGroup name="…">` parsed in pass 1, stored in `grammar.attributeGroups`.
- `<xs:group ref="…">` inside compositors: creates a placeholder `ModelGroup` with `ref` set, empty particles.
- `<xs:attributeGroup ref="…">` inside complex types or other attribute groups: creates a placeholder `AttributeUse` with `attributeGroupRef` set.
- `xs:all` children validated to reject group references (XSD 1.0 restriction).
- UPA check moved from `buildComplexType` to post-resolution pass (runs after expansion so referenced content is analyzed).
- `allComplexTypes`, `allModelGroupDefs`, `allAttributeGroupDefs` tracked for post-resolution processing.

### Expansion passes (pass 2c/2d)
- `expandModelGroups`: walks every particle tree depth-first; resolves `ref=` placeholders by splicing the referenced definition's content. Uses an `expanding` set for cycle detection. Definition's top particle occurrence (if non-default) is preserved via a sequence wrapper.
- `expandAttributeGroups`: splices referenced attribute-group uses recursively, with cycle detection. After expansion, duplicate attribute names within one complex type are compile-time errors (`INVALID_SCHEMA_DOCUMENT`).

### Instance-validator fix
- `consumeMatchingChildren` for group terms now delegates to `validateRepeatingGroup` (honouring the group particle's occurrence) instead of dispatching directly to single-pass handlers. Errors from inside a nullable group that doesn't match are suppressed so the parent sequence can continue normally.

### Error codes
- `CIRCULAR_REFERENCE`: new schema-error code for direct/transitive self-referencing model/attribute groups.
- `UNRESOLVED_REFERENCE`: reused for missing group/attribute-group refs.

### Tests
- 14 compiler tests: definition registration, ref expansion, forward refs, occurrence on ref, nested refs, circular refs (direct and transitive), unresolved refs, UPA in group definitions, all-group ref rejection.
- 6 validator tests: end-to-end validation with group refs, optional groups, repeating groups, choice-with-groups, attribute groups, type resolution through attribute groups.