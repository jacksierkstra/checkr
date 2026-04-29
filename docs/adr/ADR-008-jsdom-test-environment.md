# ADR-008: Use `jest-environment-jsdom` as the test environment

**Status:** Accepted

---

## Context

Checkr targets two runtimes: **Node.js 18+** and **browsers**. Since [ADR-017](./ADR-017-native-domparser.md) the library uses the **native `DOMParser`** API available in both environments — there are no third-party DOM dependencies.

Jest's default test environment is `node`, which uses the Node.js runtime and does not provide browser globals (`document`, `window`, `DOMParser`, etc.). Running tests under `node` only exercises the Node.js path and does not validate browser-compatible behaviour.

Two alternatives were evaluated:

1. **`jest-environment-node`** — fast, low overhead, but does not provide `DOMParser` or browser globals.
2. **`jest-environment-jsdom`** — simulates a browser DOM environment using jsdom, providing `DOMParser` and a DOM that closely matches browser behaviour.

---

## Decision

The Jest test environment is set to **`jest-environment-jsdom`** globally in `jest.config.ts`. All test files run in this environment.

The reasons for choosing jsdom are:

1. **Provides `DOMParser` as a spec-compliant global.** The library calls `new DOMParser().parseFromString(...)` directly. `jest-environment-jsdom` supplies this global, allowing all parsing and validation code to be tested through the same code path used in real browsers.
2. **Prevents accidental Node.js-only API usage.** Running under jsdom means any code path that accidentally uses `fs`, `Buffer`, or other Node.js builtins will fail immediately in tests, catching browser-incompatible code before release.
3. **Keeps the test environment representative of browser consumers.** The library targets browsers as a first-class environment. Running tests in a browser-like global scope ensures that no assumption about the Node.js global scope is baked into the library logic.

---

## Consequences

- **Positive:** Tests are environment-faithful to browser usage — the primary target environment for library consumers.
- **Positive:** Browser-specific DOM quirks (e.g., namespace handling) surface in tests rather than in production.
- **Negative:** `jest-environment-jsdom` is slightly slower to set up than `jest-environment-node` due to jsdom's overhead.
- **Negative:** jsdom does not perfectly replicate every browser's DOM behaviour. Edge cases specific to Chrome, Firefox, or Safari may not be caught by the test suite.
- **Constraint:** The test environment must not be changed without a new ADR and a thorough audit of all test assumptions.
