# ADR-029: XPath Evaluation Integration

**Status:** Proposed  
**Related:** [ADR-028](./ADR-028-xsd-11-support.md), ADR-030 (Schematron)

---

## Context

Several planned features require evaluating XPath expressions against XML documents:

| Feature | XPath version required |
|---------|----------------------|
| XSD 1.1 `xs:assert` | XPath 2.0 |
| XSD 1.1 `xs:alternative` | XPath 2.0 |
| Schematron rules | XPath 1.0 minimum; XPath 2.0 for SVRL |

The DOM Level 3 `document.evaluate` API provides XPath 1.0 evaluation and is available natively in all modern browsers and in Node.js 18+ (via `jsdom` in tests, and natively in the V8 runtime). XPath 2.0 is **not** natively available in any browser or Node.js environment.

This creates a tension with Checkr's current **zero runtime dependency** stance (ADR-002).

---

## Decision

### XPath 1.0
Use `document.evaluate` (native DOM API) for XPath 1.0 evaluation. This:
- Requires no additional dependency.
- Is available in all supported environments (Node.js 18+, modern browsers).
- Is sufficient for Schematron basic profiles.

### XPath 2.0
XPath 2.0 evaluation requires a third-party library (e.g., `fontoxpath`, `xpath`). This conflicts with ADR-002.

**Resolution:** XSD 1.1 `xs:assert` and `xs:alternative` will be implemented using XPath 1.0 syntax only in the initial release, with a documented limitation that XPath 2.0 expressions are not supported. If demand warrants it, XPath 2.0 support can be added as an **optional peer dependency** — the library checks for its presence at runtime and falls back gracefully (emitting a `PARSE_ERROR` with a helpful message if a 2.0-only expression is encountered without the library installed).

### Implementation approach
- Introduce a `XPathEvaluator` abstraction in `src/lib/utils/xpath.ts`.
- The default implementation delegates to `document.evaluate`.
- An optional `XPath2Evaluator` wrapper can be injected if a compatible library is detected.
- Steps that need XPath call the evaluator through this abstraction, never directly.

---

## Consequences

- **Positive:** XPath 1.0 support adds zero runtime dependencies.
- **Positive:** The `XPathEvaluator` abstraction makes the XPath implementation swappable without touching validation logic.
- **Negative:** XPath 2.0 expressions in `xs:assert` / `xs:alternative` will silently degrade to "not evaluated" (or return an error) without the optional library. This must be clearly documented.
- **Negative:** Testing XPath evaluation behaviour requires a consistent XPath engine across Node.js and browser environments — the `jsdom` test environment provides `document.evaluate` (XPath 1.0), which is sufficient for unit tests.
