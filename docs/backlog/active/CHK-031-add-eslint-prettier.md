---
id: CHK-031
title: "Add ESLint + Prettier toolchain"
area: "ops"
priority: "high"
status: "draft"
depends_on: ["CHK-029"]
required_context: []
optional_context: []
estimate: null
---

## Context

`main` added ESLint (flat config) + Prettier and documented the decision in `docs/adr/ADR-023-eslint-prettier.md` on main. The rationale (from that ADR): the codebase already carries lint-catchable defects — `any` escapes, `console.warn` side effects, and no `no-floating-promises` enforcement. `develop` has no linter; `scripts/guardrails.mjs` explicitly notes it is the enforcement tool only because no linter is installed. Port the toolchain from main, adapted to `develop`.

Reference: `main` branch `eslint.config.js`, `.prettierrc`, `.prettierignore`, `package.json` scripts (`lint`, `lint:fix`, `format`, `format:check`), ADR-023.

## Must Follow

- Port the ESLint flat config from main (`eslint.config.js`) with these rules: `@typescript-eslint` recommended set, `prettier/prettier: error`, `no-explicit-any: error`, `no-floating-promises: error`, `no-unused-vars` with `^_` ignore patterns, `no-console: error`. `no-console` off and `no-explicit-any` downgraded to warn in `src/**/*.test.ts`; `src/benchmark/**`, `dist`, `coverage`, `node_modules` ignored.
- **Adaptation for `develop`**: the repo has no `"type": "module"` and `eslint.config.js` with `import` syntax will be interpreted as CommonJS. Use `eslint.config.mjs` (or otherwise make the flat config ESM-valid) so `import` statements work.
- Port `.prettierrc` from main (tabWidth 2, double quotes, trailingComma "all", semi, printWidth 100, arrowParens "always") and `.prettierignore` (node_modules, dist, coverage).
- Add scripts: `lint` (`eslint "src/**/*.ts" --max-warnings 0`), `lint:fix`, `format` (`prettier --write "src/**/*.ts"`), `format:check` (`prettier --check "src/**/*.ts"`).
- Add devDependencies from main: `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-prettier`, `prettier`.
- Update `scripts/guardrails/npm-dependencies.json` via `node scripts/guardrails.mjs --update`.
- CI: add `npm run lint` and `npm run format:check` steps to `.github/workflows/ci.yml` (per ADR-023's decision; note: main's committed `ci.yml` does not actually include them — follow the ADR intent, and say so in the Decision/Outcome).

## Do Not

- Do not hand-fix every existing lint violation in this task. The task delivers the toolchain and makes it pass; a follow-up cleanup of violations is expected and should be tracked (note in Decision/Outcome how many violations were fixed in-task vs deferred).
- Do not port `commitlint` — that belongs to CHK-032.
- Do not change the guardrails rule set; they are complementary.

## Deliver

- `eslint.config.mjs` (ESM flat config, adapted), `.prettierrc`, `.prettierignore`.
- `package.json` scripts + devDependencies, updated `package-lock.json`.
- CI steps for lint + format:check.
- Updated guardrails inventory.
- Record the decision in `docs/adr/` following the repo's ADR convention (a new file, e.g. `docs/adr/eslint-prettier.md`).

## Acceptance Criteria

- [ ] `npm run lint` exits 0 with `--max-warnings 0`.
- [ ] `npm run format:check` exits 0 (or the deliberate first-pass format diff is committed as part of this task and then exits 0).
- [ ] `node scripts/agent-check.mjs full` passes (lint/format are CI gates, not agent-check targets; agent-check must remain green).
- [ ] CI runs lint and format:check on PRs.
- [ ] No `any`-escapes or `console.*` calls remain in `src/lib` outside tests (verifiable via `npm run lint`).
- [ ] ADR file exists in `docs/adr/` documenting the decision and the develop-specific adaptations (`.mjs` config).

## Out of Scope

- commitlint / conventional commits (CHK-032).
- Enforcing lint in agent-check targets (CI covers it).
- Reformatting `docs/` or non-TS files.

## Risks

- **Large formatting diff**: `develop` currently uses 4-space indentation; the first Prettier pass reformats much of `src/lib`. Mitigation: commit the format pass separately from the config so the config diff stays reviewable.
- **Config format mismatch**: flat config `import` syntax breaks under CJS resolution — the `.mjs` adaptation is mandatory, verify with `npm run lint` on an empty violation first.
- **New violations surfaced**: `no-floating-promises` and `no-explicit-any` may fail on existing code; fix those (they are real defects per ADR-023) or downgrade deliberately with a documented reason.

## Dependencies

- CHK-029 (npm) — ESLint/Prettier installed and run via npm.
- May run in parallel with CHK-030 (Vitest).

## Verification

```
npm run lint
npm run format:check
node scripts/agent-check.mjs full
```

## Decision / Outcome

*(filled in after completion)*