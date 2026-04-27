# ADR-010: Use `ts-patch` (`tspc`) instead of plain `tsc` for builds

**Status:** Accepted

---

## Context

Checkr uses the path alias `@lib/*` → `src/lib/*`, configured in `tsconfig.json` via `compilerOptions.paths`. This alias is used throughout the codebase to avoid deep relative imports like `../../../lib/types/xsd`.

TypeScript's compiler (`tsc`) resolves path aliases **during type-checking** but does **not rewrite them in emitted JavaScript**. The compiled `dist/` output would contain unresolvable `@lib/...` imports, causing runtime errors for consumers.

Three solutions were considered:

1. **Post-process with a path-rewriting tool** (e.g., `tsc-alias`) — adds a separate build step and configuration.
2. **Use `ts-node` with `tsconfig-paths`** — works at runtime but does not help for compiled output.
3. **Use `ts-patch` with `typescript-transform-paths`** — integrates the path rewrite as a TypeScript compiler plugin, applied at emit time as part of the normal `tsc` invocation.

---

## Decision

The build uses **`ts-patch`** (`tspc` binary) with the `typescript-transform-paths` plugin declared in `tsconfig.build.json`. This rewrites `@lib/*` aliases to relative paths in the emitted `dist/` JavaScript.

`npm run build` invokes `tspc -p tsconfig.build.json`. Contributors must not substitute `tsc` for `tspc` in the build command.

---

## Consequences

- **Positive:** Path aliases work seamlessly in both source (TypeScript) and output (JavaScript) without a separate post-processing step.
- **Positive:** The `@lib/*` alias keeps imports clean and refactoring-friendly throughout the codebase.
- **Negative:** `ts-patch` monkey-patches the TypeScript compiler. Upgrading TypeScript requires verifying compatibility with `ts-patch` and `typescript-transform-paths`.
- **Negative:** Using `tspc` instead of `tsc` is a non-obvious build requirement. Contributors unfamiliar with the setup may accidentally run `tsc` and produce broken output.
- **Constraint:** `tsconfig.build.json` (used for production builds) is separate from `tsconfig.json` (used for IDE and test purposes). Changes to path aliases must be reflected in both files.
