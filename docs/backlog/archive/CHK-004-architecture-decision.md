---
id: CHK-004
title: "Decide checkr's XSD component model architecture"
type: "ticket"
wayfinder_type: "grilling"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-003"]
required_context: ["docs/research/reference-xsd-validator-architectures.md"]
optional_context: []
assignee: "jacks"
estimate: null
---

## Context

Checkr's current architecture is a pipeline-based model: a linear transformation from XML DOM nodes to `XSDElement[]`, then a validator pipeline that walks the XML tree. This works for simple schemas but cannot handle the full XSD 1.0 component model — type derivations, substitution groups, identity constraints, model groups, wildcards, etc.

The reference architectures have been researched (CHK-003). Now we need to decide: what component model should checkr adopt?

## Must Follow

Follow the grilling skill protocol: conversation, one question at a time.

## Do Not

Do not implement anything. Produce a decision, not a deliverable.

## Deliver

An ADR (Architecture Decision Record) in `docs/adr/` that specifies:

1. The component model structure (types, elements, attributes, etc.)
2. How cross-references work (QName resolution, identity)
3. The two-phase architecture (schema compilation → instance validation)
4. Namespace organization (grammar-per-namespace vs flat)
5. Reference resolution strategy (eager vs lazy, multi-pass)
6. Error handling taxonomy
7. Schema validation approach (schema-for-schemas)
8. PSVI support (yes/no, minimal/full)

## Acceptance Criteria

- [ ] The ADR is written and linked from this ticket
- [ ] The ADR covers all eight areas above
- [ ] Each decision is justified with reference to Xerces-J, libxml2, or XSD spec requirements

## Out of Scope

- Implementation work
- Test runner design
- Gap analysis (what features are missing)
- Feature implementation order

## Dependencies

Depends on CHK-003 (research on reference architectures).

## Verification

```
ls docs/adr/architecture-component-model.md
```

## Question

What component model architecture should checkr adopt for its XSD 1.0 processor, and how should the two-phase (schema compilation → instance validation) architecture be structured?

## Decision / Outcome

The ADR is at [docs/adr/architecture-component-model.md](../../adr/architecture-component-model.md).

Checkr adopts a **typed component graph** (discriminated union of TypeScript interfaces mirroring XSD Part 1 components) with a **two-phase architecture**: eager multi-pass schema compilation → immutable `CompiledSchema` → instance validation. Cross-references are **QName `{ns}localName`** keys; anonymous components get parent-derived synthesized identities. Namespace organization is **grammar-per-namespace** (Xerces-J model over libxml2's flat structs). Reference resolution is **eager, multi-pass** (4 passes); unresolvable references are compile-time errors. Errors are `SchemaError` unions (severity/code/message/location/phase) reported via a **callback/listener**, continuing after non-fatal errors. Schemas are validated against the **schema-for-schemas at compile time**. **No formal PSVI** in the core, but internal typed-value/effective-type hooks keep the option open.

All eight Deliver areas are covered and each decision is justified against Xerces-J, libxml2, or XSD spec requirements.