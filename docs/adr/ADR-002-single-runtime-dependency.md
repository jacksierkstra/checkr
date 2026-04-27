# ADR-002: Use `@xmldom/xmldom` as the sole runtime dependency

**Status:** Superseded by [ADR-017](./ADR-017-native-domparser.md)

---

## Context

Checkr parses both XML and XSD strings into DOM trees for inspection. Two approaches were considered:

1. **Use native browser/Node DOM APIs directly.** `DOMParser` is available natively in browsers and in Node.js 18+, but its availability and behaviour differ across environments. Testing against a native `DOMParser` in Jest requires extra shimming, and the API surface is not guaranteed to be stable across all target environments.
2. **Use a dedicated cross-environment DOM library.** `@xmldom/xmldom` is a mature, well-maintained library that provides a consistent DOM API across Node.js and browsers. It is the canonical solution for cross-environment XML parsing in the JavaScript ecosystem.

Key forces:

- The library must behave identically in Node.js (14+) and in modern browsers.
- Minimising the number of runtime dependencies reduces supply-chain risk and keeps install size small.
- The library must not pull in large transitive dependency trees.

---

## Decision

Use **`@xmldom/xmldom`** as the single runtime dependency. It handles all DOM construction from raw XML and XSD strings.

No other runtime dependency shall be added without a new ADR.

---

## Consequences

- **Positive:** One runtime dependency means minimal attack surface and a lean `node_modules` for consumers.
- **Positive:** Behaviour is consistent across Node.js and browsers; tests exercise the same code path in both environments (see [ADR-008](./ADR-008-jsdom-test-environment.md)).
- **Positive:** `@xmldom/xmldom` uses the W3C DOM Level 2 API, which maps directly to browser `Document`/`Element` types.
- **Negative:** Any bugs or gaps in `@xmldom/xmldom` become bugs in Checkr by proxy. The library is pinned to `^0.9.x` to limit unexpected breakage.
- **Negative:** Namespace handling in `@xmldom/xmldom` can be inconsistent with real browser behaviour, requiring the dual-lookup pattern described in [ADR-007](./ADR-007-dual-namespace-lookup.md).
