# ADR-009: Explicitly defer `xs:all`, `xs:key`, `xs:import`, `xs:group`

**Status:** Partially Superseded  
**Superseded for xs:all by:** [ADR-025](./ADR-025-xs-all-full-semantics.md)  
**Superseded for xs:group/xs:attributeGroup by:** [ADR-026](./ADR-026-xs-group-attribute-group.md)  
**Superseded for xs:substitutionGroup by:** [ADR-027](./ADR-027-substitution-group.md)  
**Still applies to:** `xs:import`, `xs:include`, `xs:redefine`

---

## Context

XSD is a large specification. Several features were considered during initial development but were deferred because:

1. **Partial implementations produce silent wrong results.** A half-implemented `xs:import` will silently skip imported types rather than raising an error, causing valid documents to be rejected and invalid documents to pass — the worst possible failure mode for a validation library.
2. **These features require significant architectural work** that would increase complexity without enough usage justification at the current stage of the library.

The features in question:

| Feature | Reason for deferral |
|---------|---------------------|
| `xs:all` | Content model semantics differ significantly from `xs:sequence`/`xs:choice`; partial support risks breaking order-independence guarantees |
| `xs:key`, `xs:unique`, `xs:keyref` | Require cross-element identity constraint resolution — a separate validation pass not present in the current architecture |
| `xs:import`, `xs:include` | Require loading and merging external schema documents; cross-origin and file-system concerns are out of scope for a pure library |
| `xs:group`, `xs:attributeGroup` | Named reusable groups require a second-pass symbol table that the current single-pass pipeline does not support |

---

## Decision

The following XSD features were **explicitly out of scope** at the time of this decision. Most have since been implemented:

- `xs:all` — ✅ **Implemented** (full semantics via ADR-025; `validateAllChildren` step)
- `xs:key`, `xs:unique`, `xs:keyref` — ✅ **Implemented** (`validateIdentityConstraints` document-level step)
- `xs:import`, `xs:include`, `xs:redefine` — ❌ **Still deferred** (requires loading external schema documents)
- `xs:group`, `xs:attributeGroup` — ✅ **Implemented** (two-phase parse + `GroupResolver` module via ADR-026)
- `xs:substitutionGroup` — ✅ **Implemented** (`SubstitutionGroupResolver` via ADR-027)

Only `xs:import`, `xs:include`, and `xs:redefine` remain out of scope. If Checkr encounters these constructs it silently ignores them.

---

## Consequences

- **Positive:** Users receive predictably correct results for the supported XSD subset rather than subtly wrong results for unsupported features.
- **Positive:** The codebase remains focused; contributors are not tempted to add speculative partial support.
- **Negative:** Checkr cannot validate documents that rely on these features. Users with such schemas must be aware of this limitation.
- **Negative:** Silent ignoring of unsupported constructs means users may not realise their schema uses a deferred feature until they notice missing constraints.
