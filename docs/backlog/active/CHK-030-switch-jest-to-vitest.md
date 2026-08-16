---
id: CHK-030
title: "Switch test runner from Jest to Vitest"
area: "ops"
priority: "high"
status: "draft"
depends_on: ["CHK-029"]
required_context: []
optional_context: []
estimate: null
---

## Context

`main` migrated the test runner from Jest (with `ts-jest`) to Vitest (see `main` branch `vitest.config.ts`, `package.json` devDependencies, and the `test` script `vitest run --coverage`). Vitest is faster (esbuild transform), is natively ESM/TS friendly, and uses the V8 coverage provider already in use. `develop` still runs Jest with the commented-out `jest.config.ts`. Port the runner so tests, coverage, and CI match main's setup.

Current facts on `develop`: 16 test files, none import from `@jest/globals` (they use ambient `describe`/`it`/`expect`), so `globals: true` in the Vitest config makes them run unchanged.

## Must Follow

- Port `vitest.config.ts` from main, adapted to `develop`: `@lib/*` and `@benchmark/*` alias entries (both bare and `.js`-suffixed forms, matching main), `environment: "jsdom"`, `globals: true`, `include: ["src/**/*.test.ts"]`, V8 coverage provider with `reportsDirectory: "coverage"`.
- Update the `test` script in `package.json` to `vitest run --coverage`, and the `benchmark` script stays `tsx ./src/benchmark/run.ts`.
- Remove Jest devDependencies (`jest`, `@jest/globals`, `@types/jest`, `jest-environment-jsdom`, `ts-jest`); add `vitest`, `@vitest/coverage-v8`, `jsdom` (versions from main: `vitest ^3.2.4`, `@vitest/coverage-v8 ^3.2.4`, `jsdom ^26.1.0`).
- Delete `jest.config.ts`.
- Update `scripts/guardrails/npm-dependencies.json` via `node scripts/guardrails.mjs --update` (devDependencies genuinely change).
- All 16 test files must pass under Vitest without per-file edits (rely on `globals: true`); if any file needs a `vitest` import, that is allowed but must be the exception and documented.

## Do Not

- Do not port main's `type: "module"` changes (CHK-029 scope decision; stays NodeNext/CJS-compatible).
- Do not change test-file organization or coverage thresholds — keep current behavior (coverage directory `coverage/`).
- Do not touch `.github/workflows/ci.yml` beyond what CHK-029 already changed; CI runs `npm run test` which now resolves to Vitest automatically.

## Deliver

- New `vitest.config.ts` (adapted from main).
- Updated `package.json` (scripts + devDependencies) and `package-lock.json`.
- Deleted `jest.config.ts`.
- Updated guardrails npm-dependencies inventory.

## Acceptance Criteria

- [ ] `npm run test` reports Vitest (not Jest) and exits 0, including coverage collection.
- [ ] All existing `src/**/*.test.ts` files (16) are picked up and pass; no test file was rewritten unless a documented exception.
- [ ] Coverage output lands in `coverage/` via the v8 provider.
- [ ] `node scripts/agent-check.mjs full` passes.
- [ ] No `jest` or `@jest` references remain in repo-authored config/deps (`grep -rn "jest" package.json vitest.config.ts` finds nothing actionable).

## Out of Scope

- Migrating test style/assertion libraries (files keep ambient globals).
- Adding new tests or coverage thresholds.
- ESM-only output.

## Risks

- **Ambient globals mismatch**: if a test relied on Jest-specific globals/matchers not present in Vitest (`jest.fn()` etc.), it fails — grep for `jest.` in tests first and convert those calls.
- **Alias resolution**: `@lib` aliases must resolve identically; main's config already encodes both `.js` and bare forms — copy exactly.
- **Coverage provider divergence**: `collectCoverage` in jest used `v8` too, so numbers should be comparable.

## Dependencies

- CHK-029 (npm) — Vitest is installed/run via npm.

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
node scripts/agent-check.mjs full
```

## Decision / Outcome

*(filled in after completion)*