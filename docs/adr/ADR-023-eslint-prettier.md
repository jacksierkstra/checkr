# ADR-023: Add ESLint + Prettier toolchain

**Status:** Accepted  
**Supersedes:** [ADR-015](./ADR-015-no-linter.md)

---

## Context

ADR-015 deferred linting and formatting to keep tooling overhead low. That decision has already produced observable debt — three known bugs were listed in the ADR itself:

- `validateNumericConstraints` uses `schema: any`, escaping type safety.
- `console.warn` inside `validateType` side-steps the errors-as-values contract.
- No `no-floating-promises` enforcement, relevant given the async API.

These are not theoretical risks — they are existing defects that a linter would have caught at the time of introduction. As the codebase grows and potentially gains contributors, the absence of automated style enforcement will compound.

---

## Decision

Add **ESLint** (with `@typescript-eslint`) and **Prettier** as development tooling.

### ESLint configuration (`eslint.config.js`)

The project uses ESLint's **flat config format** (`eslint.config.js`). Rules enabled:

- `@typescript-eslint/no-explicit-any` — eliminates `any` escapes.
- `no-console` — enforces the errors-as-values contract; no side-effecting `console.warn` in pipeline steps.
- `@typescript-eslint/no-floating-promises` — catches unawaited Promises.
- `@typescript-eslint/no-unused-vars` — catches unused variables (with `^_` ignore pattern for intentionally unused parameters).

`no-console` is disabled for `src/**/*.test.ts`. Benchmark scripts (`src/benchmark/**`) are excluded entirely via the `ignores` configuration.

### Prettier configuration (`.prettierrc`)

Single opinionated style enforced project-wide:

- 2-space indentation
- Double quotes
- Trailing commas (`"all"`)
- Semicolons on
- 100-character print width

### CI enforcement

Both `npm run lint` and `npm run format:check` are added as CI steps that block merges on failure.

---

## Consequences

- **Positive:** The three known defects (`any`, `console.warn`, floating promises) are immediately caught and will not recur.
- **Positive:** Style debates in code review are eliminated; Prettier is the arbiter.
- **Positive:** New contributors get real-time feedback in their IDE via the ESLint/Prettier plugins.
- **Negative:** Initial setup requires fixing all existing lint violations before CI passes.
- **Negative:** Stricter formatting means existing code diffs will show whitespace-only changes on first Prettier pass.
- **Constraint:** `no-console` applies to all source files (`src/**`) except test files and benchmark scripts.
