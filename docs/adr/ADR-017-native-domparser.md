# ADR-017: Migrate to native `DOMParser` — remove `@xmldom/xmldom`

**Status:** Accepted  
**Supersedes:** [ADR-002](./ADR-002-single-runtime-dependency.md), [ADR-007](./ADR-007-dual-namespace-lookup.md)

---

## Context

ADR-002 chose `@xmldom/xmldom` because native `DOMParser` was unavailable or inconsistent across target environments. That constraint no longer applies:

- **Node.js 18+** ships `DOMParser` natively (via the WHATWG-compatible `globalThis.DOMParser`).
- **All modern browsers** have supported `DOMParser` for years.
- **Node.js 14 and 16** are both past end-of-life and are no longer supported targets.

The `@xmldom/xmldom` dependency introduced its own problems:

- Namespace handling is inconsistent with real browser behaviour, requiring the dual-lookup workaround in ADR-007 (every DOM query written twice).
- Any bug in `@xmldom/xmldom` is a bug in Checkr.
- The library is pinned to `^0.9.x` to limit breakage, but security patches in a newer major would require a manual migration.

The test environment (`jsdom`, ADR-008) already provides `DOMParser` as a global, so tests continue to work without changes to the test configuration.

---

## Decision

Prefer the **native `DOMParser`** API when it is available, and fall back to `@xmldom/xmldom` in runtimes that do not expose a global `DOMParser` (notably plain Node.js).

- `XMLParserImpl` will use `globalThis.DOMParser` when present.
- When `DOMParser` is missing, `XMLParserImpl` falls back to `@xmldom/xmldom` so Node.js consumers can parse XML without injecting their own DOM implementation.
- The fallback keeps the public API unchanged while preserving browser behaviour.

The dual-lookup pattern (ADR-007) is removed in full. All DOM queries use `getElementsByTagNameNS` with the XSD namespace URI directly, as namespace handling in native parsers is correct.

---

## Consequences

- **Positive:** Browser and jsdom consumers still use the native DOMParser path.
- **Positive:** Node.js consumers get a working XML parser path instead of a runtime `ReferenceError`.
- **Positive:** Namespace handling remains consistent with the existing native-parser code path.
- **Positive:** Native DOM types (`Element`, `Document`) from `lib.dom.d.ts` are used directly — no third-party type stubs required.
- **Negative:** The package now carries a small runtime XML DOM dependency for Node fallback support.
- **Negative:** jsdom's `DOMParser` (used in tests) may have subtle differences from real browser `DOMParser`. Edge cases specific to Chrome, Firefox, or Safari may not surface in the test suite.
- **Constraint:** All pipeline steps that previously imported `Element` from `@xmldom/xmldom` must switch to `Element` from the global DOM type. No import needed — it is a global type in `lib.dom.d.ts`.
