---
id: CHK-021
title: "Wildcards"
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

The gap analysis rates wildcards `missing` — `xs:any` and `xs:anyAttribute` are unparsed. The `Wildcards_w3c.xml` set (315 groups) and Sun `Wildcard.testSet` exercise namespace constraints, `processContents` (strict/lax/skip), and attribute wildcards. This is a self-contained feature on the declaration layer (CHK-017).

## Deliver

`xs:any` and `xs:anyAttribute` with namespace constraint evaluation, `processContents` semantics, and correct wildcard behavior in derivation.

## Acceptance Criteria

- [ ] `xs:any` particles: namespace constraint (`##any`, `##other`, `##targetNamespace`, `##local`, explicit list) enforced on instance elements
- [ ] `processContents="strict"`: wildcard-matched elements validated against their declarations; `"lax"`: validated if a declaration exists, skipped otherwise; `"skip"`: no validation
- [ ] `xs:anyAttribute` with the same namespace constraint and processContents semantics
- [ ] Wildcard intersection/union rules for type derivation (the `notNamespace` and `notQName` constraints if applicable)
- [ ] A Wildcard-test-set-style schema validates correctly

## Out of Scope

- Identity constraints (CHK-022)
- Multi-document namespace resolution (CHK-024)

## Dependencies

Blocked by CHK-017 (declarations the wildcard lax/strict mode delegates to).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can wildcards (any/anyAttribute, processContents, namespace constraints) land on the declaration layer?

## Answer

Yes. Wildcards are a self-contained declaration-layer feature. `Wildcard` now carries a normalized `{namespace constraint}` (any / other(target) / uris-set, with the absent namespace as the `""` sentinel, resolving `##targetNamespace` and `##local` at compile time), and `ComplexTypeDefinition`/`AttributeGroupDefinition` carry an `attributeWildcard`. The spec's set algebra (§3.10.6) is implemented in `src/lib/xsd/wildcards.ts`: subset for restriction, union for extension, intersection for the "complete wildcard" (local anyAttribute × referenced attribute-group wildcards, §3.4.3).

## Decision / Outcome

Wildcards landed on the declaration layer (CHK-021):

- **Compilation** — `xs:any`/`xs:anyAttribute` parse `processContents` (default strict) and the `namespace` attribute into a normalized `NamespaceConstraint` (default `##any`); mixing `##any`/`##other` with other tokens is a schema error (§3.10.1). Pass 2d.5 computes every complex type's and attribute group's "complete wildcard" (local wildcard ∩ referenced attribute-group wildcards, §3.4.3). Pass 2f unions the base wildcard for extensions (§3.4.2, Attribute Wildcard Union); restrictions validate the derived wildcard is a subset of the base's with processContents at least as strict (§3.4.6). Particle restriction implements Wildcard:Wildcard subset + processContents ordering, Elt:Wildcard (element restricting a wildcard, namespace must be allowed), and rejects wildcard-over-element (§3.9.6). `##other` never matches the absent namespace (§3.10.4 rule 2.3). UPA analysis now uses the real namespace constraint instead of treating every wildcard as `##any`.
- **Instance validation** — wildcard particles consume children matching the constraint with min/maxOccurs enforced; `processContents="strict"` requires a declaration and validates against it (`UNDECLARED_ELEMENT` when missing), `lax` validates only when a declaration exists, `skip` validates nothing. `xs:anyAttribute` applies the same constraint + processContents semantics to undeclared attributes, with strict looking up global attribute declarations by QName. Attribute wildcards are honored through derivation (extension union / restriction subset).
- **Semantics verified against the XSD 1.0 spec** — the namespace-constraint model, "Wildcard allows Namespace Name", "Wildcard Subset", and "Attribute Wildcard Union/Intersection" were extracted from the W3C spec text and implemented 1:1.
- Wildcards inside `xs:all` remain a compile error (XSD 1.1 feature, out of scope).
- 34 new tests (18 validator, 16 compiler) cover all five acceptance criteria; full suite 632 tests green.