# ADR-014: CommonJS-only module output

**Status:** Accepted

---

## Context

The compiled `dist/` output is a single CommonJS bundle. `package.json` is configured as:

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    "import": "./dist/index.js",
    "require": "./dist/index.js"
  }
}
```

Both the `"import"` and `"require"` export conditions point to the same CJS file. There is no separate ESM build.

`tsconfig.build.json` uses `"module": "NodeNext"` which emits CommonJS when input files use `import`/`export` with no `.mjs` extension.

Forces considered:

- **Simplicity:** Maintaining a single output format avoids dual-build complexity (two `tsconfig` files, two output directories, conditional `package.json` exports for CJS vs. ESM).
- **Bundler compatibility:** Most bundlers (Webpack, Rollup, Vite, esbuild) can consume both CJS and ESM. CJS interoperability is near-universal.
- **Tree-shaking:** ESM allows static analysis for dead-code elimination. CJS does not. Consumers who bundle Checkr into a browser application cannot tree-shake CJS output. For a library of this size, the impact is modest.
- **Node.js ESM:** Node.js 12+ supports ESM natively. A CJS package consumed in a pure ESM Node.js project requires a dynamic `import()` or a compatibility wrapper.
- **`"import"` condition pointing to CJS:** The current `exports` configuration maps the `"import"` condition to a CJS file. This is technically incorrect — the `"import"` condition signals ESM to Node.js and bundlers. While most bundlers tolerate it, Node.js's native ESM resolver may reject it in strict mode.

---

## Decision

Ship CommonJS-only output in the current version. Both `"import"` and `"require"` export conditions point to the same CJS file.

This decision prioritises simplicity of the build pipeline over optimal ESM compatibility.

---

## Consequences

- **Positive:** A single build step, single output directory, and single set of `.d.ts` files.
- **Positive:** Works in all Node.js versions and with all bundlers that support CJS.
- **Negative:** No tree-shaking for bundled browser consumers. The full library is always included.
- **Negative:** The `"import"` export condition pointing to CJS is semantically incorrect and may cause issues with strict ESM consumers.
- **Negative:** Pure ESM environments (e.g., Deno, certain Node.js ESM setups) may require workarounds.
- **Future:** A dual CJS+ESM build should be introduced by:
  1. Adding a second `tsconfig.esm.json` targeting `"module": "ESNext"` with output to `dist/esm/`
  2. Updating `package.json` exports to `"import": "./dist/esm/index.js"`, `"require": "./dist/index.js"`
  3. This is a non-breaking change and does not require a new ADR — but should be tracked as a planned improvement.
