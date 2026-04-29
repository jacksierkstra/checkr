# ADR-028: XSD 1.1 Support Strategy

**Status:** Proposed

---

## Context

XSD 1.1 (W3C Recommendation, 2012) is the successor to XSD 1.0. It is largely additive and backward-compatible: any valid XSD 1.0 schema is also a valid XSD 1.1 schema. Key new features include:

| Feature | Description |
|---------|-------------|
| `xs:assert` | XPath 2.0 assertions on element/attribute values |
| `xs:alternative` | Conditional type assignment using XPath |
| `xs:openContent` / `xs:defaultOpenContent` | Wildcard open content models |
| `xs:override` | Supersedes `xs:redefine`; allows overriding named schema components |
| Relaxed `xs:all` | `xs:all` children may have `maxOccurs > 1` |
| `xs:sequence` / `xs:choice` on `xs:all` | Mixed compositors inside `xs:all` |

---

## Decision

### Version detection
XSD 1.1 is signalled by the `vc:minVersion="1.1"` attribute on `xs:schema` (using the XSD version control namespace `http://www.w3.org/2007/XMLSchema-versioning`). Checkr should detect this attribute and activate 1.1-specific parsing and validation behaviour.

Alternatively, an API-level option (`{ version: "1.1" }`) can be passed to `Checkr` to force 1.1 mode. Both mechanisms should be supported.

### Additive implementation strategy
XSD 1.1 features are implemented as **opt-in extensions** to the existing pipeline:
- New parse steps registered only in 1.1 mode.
- New validation steps registered only in 1.1 mode.
- The existing XSD 1.0 pipeline is unchanged.

### Features requiring separate ADRs
- **`xs:assert` and `xs:alternative`** depend on XPath evaluation — see ADR-029.
- **`xs:override`** depends on `xs:include` — implement only after `xs:include` is supported (currently deferred).

### Features implementable without XPath
- `xs:openContent` / `xs:defaultOpenContent` — extended wildcard; implementable as a variation of `xs:any`.
- Relaxed `xs:all` (`maxOccurs > 1` on children) — extend the `xs:all` semantics from ADR-025.

---

## Consequences

- **Positive:** XSD 1.1 features are available without breaking existing XSD 1.0 consumers.
- **Positive:** The additive pipeline strategy keeps XSD 1.0 and 1.1 code clearly separated.
- **Negative:** Version detection adds a conditional branch to schema loading. Tests must cover both modes.
- **Negative:** `xs:assert` and `xs:alternative` block on ADR-029 (XPath evaluation). Until that ADR is resolved, XSD 1.1 support is partial.
