# ADR-009: Explicitly defer `xs:all`, `xs:key`, `xs:import`, `xs:group`

**Status:** Accepted

---

## Context

XSD is a large specification. Several features were considered during initial development but were deferred because:

1. **Partial implementations produce silent wrong results.** A half-implemented `xs:import` will silently skip imported types rather than raising an error, causing valid documents to be rejected and invalid documents to pass — the worst possible failure mode for a validation library.
2. **These features require significant architectural work** that would increase complexity without enough usage justification at the current stage of the library.

The features in question:

| Feature | Reason for deferral |
|---------|---------------------|
| `xs:all` | Content model semantics differ significantly from `xs:sequence`/`xs:choice`; partial support breaks order-independence guarantees |
| `xs:key`, `xs:unique`, `xs:keyref` | Require cross-element identity constraint resolution — a separate validation pass not present in the current architecture |
| `xs:import`, `xs:include` | Require loading and merging external schema documents; cross-origin and file-system concerns are out of scope for a pure library |
| `xs:group`, `xs:attributeGroup` | Named reusable groups require a second-pass symbol table that the current single-pass pipeline does not support |

---

## Decision

The following XSD features are **explicitly out of scope** and must not be partially implemented:

- `xs:all`
- `xs:key`, `xs:unique`, `xs:keyref`
- `xs:import`, `xs:include`
- `xs:group`, `xs:attributeGroup`

If Checkr encounters these constructs in an XSD document, it silently ignores them rather than attempting partial validation.

Implementing any of these features requires a new ADR that supersedes this one for the feature in question.

---

## Consequences

- **Positive:** Users receive predictably correct results for the supported XSD subset rather than subtly wrong results for unsupported features.
- **Positive:** The codebase remains focused; contributors are not tempted to add speculative partial support.
- **Negative:** Checkr cannot validate documents that rely on these features. Users with such schemas must be aware of this limitation.
- **Negative:** Silent ignoring of unsupported constructs means users may not realise their schema uses a deferred feature until they notice missing constraints.
