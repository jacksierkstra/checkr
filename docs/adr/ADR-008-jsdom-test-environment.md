# ADR-008: Use `jest-environment-jsdom` as the test environment

**Status:** Accepted

---

## Context

Checkr targets two runtimes: **Node.js** and **browsers**. The library's core DOM operations are performed via `@xmldom/xmldom` (see [ADR-002](./ADR-002-single-runtime-dependency.md)), which exposes a W3C DOM Level 2 API designed to replicate browser DOM behaviour.

Jest's default test environment is `node`, which uses the Node.js runtime and does not provide browser globals (`document`, `window`, `DOMParser`, etc.). Running tests under `node` only exercises the Node.js path and does not validate browser-compatible behaviour.

Two alternatives were evaluated:

1. **`jest-environment-node`** — fast, low overhead, but does not test browser globals or browser DOM behaviour.
2. **`jest-environment-jsdom`** — simulates a browser DOM environment using jsdom, providing globals and a DOM that closely matches browser behaviour.

---

## Decision

The Jest test environment is set to **`jest-environment-jsdom`** globally in `jest.config.ts`. All test files run in this environment.

The rationale is **not** that `@xmldom/xmldom` uses browser DOM globals — it does not. `@xmldom/xmldom` ships its own internal DOM implementation and never reads `window.DOMParser` or `document`. The reasons for choosing jsdom are:

1. **Prevents accidental Node.js-only API usage.** Running under jsdom instead of the `node` environment means that any code path that accidentally uses `fs`, `Buffer`, or other Node.js builtins will fail immediately in tests, catching browser-incompatible code before release.
2. **Keeps the test environment representative of browser consumers.** The library targets browsers as a first-class environment. Running tests in a browser-like global scope ensures that no assumption about the Node.js global scope is baked into the library logic.
3. **Future-proofing.** If the library ever needs to test interaction with native browser `DOMParser` or `document` APIs (e.g., an optional fast-path using the native parser when available), the test environment is already correctly configured.

---

## Consequences

- **Positive:** Tests are environment-faithful to browser usage — the primary target environment for library consumers.
- **Positive:** Browser-specific DOM quirks (e.g., namespace handling) surface in tests rather than in production.
- **Negative:** `jest-environment-jsdom` is slightly slower to set up than `jest-environment-node` due to jsdom's overhead.
- **Negative:** jsdom does not perfectly replicate every browser's DOM behaviour. Edge cases specific to Chrome, Firefox, or Safari may not be caught by the test suite.
- **Constraint:** The test environment must not be changed without a new ADR and a thorough audit of all test assumptions.
