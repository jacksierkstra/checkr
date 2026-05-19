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

Replace `@xmldom/xmldom` with the **native `DOMParser`** API available in Node.js 18+ and all modern browsers.

- `XMLParserImpl` will call `new DOMParser().parseFromString(xml, 'application/xml')`.
- `XSDPipelineParserImpl` will call `new DOMParser().parseFromString(xsd, 'application/xml')` (or delegate to `XMLParserImpl`).
- The `@xmldom/xmldom` package is removed from `dependencies`.
- All imports of `Element`, `Document`, and related types from `@xmldom/xmldom` are replaced with the native DOM types from TypeScript's `lib.dom.d.ts`.
- The minimum supported Node.js version is raised to **18**.

The dual-lookup pattern (ADR-007) is removed in full. All DOM queries use `getElementsByTagNameNS` with the XSD namespace URI directly, as namespace handling in native parsers is correct.

---

## Consequences

- **Positive:** Zero runtime dependencies — eliminates supply-chain risk entirely.
- **Positive:** Namespace handling is correct; ADR-007's dual-lookup boilerplate is removed from every pipeline step and resolver.
- **Positive:** Native DOM types (`Element`, `Document`) from `lib.dom.d.ts` are used directly — no third-party type stubs required.
- **Positive:** `@xmldom/xmldom` version pinning and upgrade anxiety goes away.
- **Negative:** Minimum Node.js version rises from 14 to 18. Consumers on older Node.js must upgrade before using this version of Checkr.
- **Negative:** jsdom's `DOMParser` (used in tests) may have subtle differences from real browser `DOMParser`. Edge cases specific to Chrome, Firefox, or Safari may not surface in the test suite.
- **Constraint:** All pipeline steps that previously imported `Element` from `@xmldom/xmldom` must switch to `Element` from the global DOM type. No import needed — it is a global type in `lib.dom.d.ts`.
