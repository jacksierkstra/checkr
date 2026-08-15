---
id: CHK-025
title: "Schema-for-schemas conformance"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-024"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The ADR requires schema-for-schemas validation at compile time (CHK-004 §7): malformed schemas must be compile-time errors, not instance-validation surprises. The gap analysis notes this is `missing` — checkr currently has no schema validity checking. The XSTS includes ~14,328 schema tests (`schemaTest`) that expect either `valid` or `invalid` for a schema document. This ticket completes the compile-time conformance surface so those schema tests can score.

## Deliver

Compile-time schema validity checking across all supported constructs: invalid facet combinations, circular derivations, duplicate components, invalid component references, abstract-component misuse, and any other conformance rules in the XSD 1.0 spec for the features implemented in CHK-008–024. Each malformed schema produces a `SchemaError` with the appropriate code and severity.

## Acceptance Criteria

- [ ] A schema that is malformed per the XSD 1.0 spec (for implemented features) fails compilation with one or more `SchemaError` codes
- [ ] A schema that is conforming per the spec compiles without schema-level errors
- [ ] Schema errors are reported through the `SchemaError` listener with `phase: schema-compilation`, not mixed into instance-validation results
- [ ] The error taxonomy covers the conformance rules for each feature area (facet combos, derivation rules, circular refs, duplicate components, abstract misuse, etc.)
- [ ] A representative schemaTest pair (valid/invalid schema) from the XSTS scores correctly

## Out of Scope

- Features not yet implemented (CHK-026–027 add their conformance surface incrementally)

## Dependencies

Blocked by CHK-024 (multi-document assembly must work before the full schema-level conformance can be checked across documents).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can compile-time schema-for-schemas conformance be completed across all implemented features, making the ~14k schemaTest surface scoreable?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*