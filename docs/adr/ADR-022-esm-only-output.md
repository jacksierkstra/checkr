# ADR-022: ESM-only module output

**Status:** Accepted  
**Supersedes:** [ADR-014](./ADR-014-cjs-only-output.md)

---

## Context

ADR-014 chose CommonJS-only output for simplicity. That decision came with known problems:

- The `"import"` export condition in `package.json` incorrectly pointed to a CJS file — semantically wrong for Node.js and strict ESM bundlers.
- Tree-shaking is not possible with CJS output, increasing bundle size for browser consumers.
- Pure ESM environments (Deno, Bun, Node.js `--input-type=module`) require workarounds to consume CJS packages.

The migration to native `DOMParser` (ADR-017) already requires raising the minimum Node.js version to 18. Node.js 18+ has full native ESM support. The ESM ecosystem has matured: all major bundlers (Webpack 5, Rollup, Vite, esbuild) handle ESM natively.

---

## Decision

Checkr ships **ESM-only** output.

`tsconfig.build.json` is updated to emit ES modules (`"module": "NodeNext"` with `.js` files treated as ESM via `"type": "module"` in `package.json`).

`package.json` is updated:

```json
{
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

The `"require"` export condition is removed. CommonJS consumers must use dynamic `import()` to load the package.

---

## Consequences

- **Positive:** The `"import"` condition correctly points to an ESM file — no semantic mismatch.
- **Positive:** Bundlers can tree-shake the library, reducing bundle size for browser consumers.
- **Positive:** Works natively in Deno, Bun, and Node.js ESM environments without workarounds.
- **Positive:** Removes the dual-condition `exports` map; a single clean entry point.
- **Negative:** **Breaking change** — CommonJS consumers using `require('@jacksierkstra/checkr')` must migrate to `import` or dynamic `import()`.
- **Negative:** CommonJS Node.js projects (i.e., projects without `"type": "module"` and without a bundler) cannot use `require()` to load this package directly.
- **Constraint:** The minimum Node.js version remains 18 (from ADR-017). All supported Node.js 18+ environments support ESM natively.
