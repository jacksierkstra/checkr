---
id: CHK-029
title: "Switch package management from Yarn to npm"
area: "ops"
priority: "high"
status: "draft"
depends_on: []
required_context: []
optional_context: []
estimate: null
---

## Context

`main` migrated the toolchain from Yarn 4 to npm (see the `main` branch: `package-lock.json`, `engines.node >= 18`, `publish:local` script, CI workflows). `develop` is now canonical, but still uses Yarn 4 (`packageManager: yarn@4.5.3`, `yarn.lock`, `.yarnrc.yml`, `corepack` steps in CI, `yarn`-based scripts in `package.json`, `AGENTS.md`, and `scripts/agent-check.mjs`). Before Vitest, ESLint, and Release Please can be ported (CHK-030/031/032), the package manager must be npm so all three can be installed and run via `npm ci` / `npm run`.

Reference for what main did: `main` branch `package.json`, `.github/workflows/ci.yml`, commit `d3a10e7` (dropped yalc).

## Must Follow

- Keep the guardrails pipeline working end-to-end: `node scripts/agent-check.mjs guardrails` must still pass. `scripts/guardrails.mjs` is package-manager-agnostic (reads `package.json`), so only the invocation of the tool from scripts/`AGENTS.md` changes.
- Update every `yarn` reference in repo-authored files: `package.json` scripts, `AGENTS.md` (Generated files table, guardrails command, verification matrix), `scripts/agent-check.mjs` (checkTool yarn → npm; `yarn test` → `npm test`, `yarn build` → `npm run build`, `yarn benchmark` → `npm run benchmark`, `yarn guardrails` → `npm run guardrails`).
- `npm ci` must succeed from a clean checkout (uses `package-lock.json`).
- CI workflow: replace `corepack enable` + `yarn install --immutable` with `npm ci` (port main's `ci.yml` shape).
- Remove `yalc` devDependency and adapt `publish:local` (main uses `npm run clean && npm run build && npm pack`).
- Update `scripts/guardrails/npm-dependencies.json` inventory via `node scripts/guardrails.mjs --update` (legitimate: devDependencies genuinely change) and commit it.

## Do Not

- Do not port `type: "module"` / ESM-only output from main (`docs/adr/ADR-022` on main is out of scope). `develop` stays NodeNext/CJS-compatible with the dual `import`/`require` exports field.
- Do not migrate tests, build, or release tooling — that is CHK-030/031/032.
- Do not hand-edit the guardrails inventory to force a pass; regenerate it with `--update` only because deps genuinely change.

## Deliver

- `package.json`: drop `packageManager`, `yarn`-flavored scripts → `npm` equivalents, drop `yalc`, add `engines: { "node": ">=18" }`.
- Delete `yarn.lock`, `.yarnrc.yml`; add committed `package-lock.json`.
- Update `AGENTS.md` and `scripts/agent-check.mjs` to npm invocations.
- Update `.github/workflows/ci.yml` to `npm ci`.
- Updated `scripts/guardrails/npm-dependencies.json`.

## Acceptance Criteria

- [ ] No `yarn` references remain in repo-authored files (package.json, AGENTS.md, scripts/, .github/); `grep -rn "yarn" --include="*.{json,md,mjs,yml,ts}"` excluding node_modules/dist finds nothing actionable.
- [ ] `yarn.lock` and `.yarnrc.yml` are deleted; `package-lock.json` exists and is committed.
- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `node scripts/agent-check.mjs full` passes (test, build, benchmark, validate-brief, guardrails).
- [ ] `.github/workflows/ci.yml` uses `npm ci` and `npm run test` (no corepack, no yarn).
- [ ] `publish:local` runs without yalc.

## Out of Scope

- Test runner migration (CHK-030), linting (CHK-031), release automation (CHK-032).
- ESM-only output (`type: "module"`) — deliberate, tracked separately.
- `engines` alignment beyond `node >= 18`.

## Risks

- **Lockfile drift**: `package-lock.json` must be generated from the same dependency set; verify with `npm ci --dry-run` before committing.
- **CI regression**: GitHub Actions runner cache key changes (`cache: 'npm'`); CI uses `npm ci` which is stricter than `yarn install` — must ensure lockfile is in sync or CI fails.
- **agent-check tool check**: `checkTool("yarn", ...)` will hard-fail until the script is updated in the same change — update script and references atomically in one commit.

## Dependencies

None. This is the foundation for CHK-030/031/032.

## Verification

```
node scripts/agent-check.mjs full
grep -rn "yarn" package.json AGENTS.md scripts/ .github/ --include="*.{json,md,mjs,yml}" || echo "no yarn references"
npm ci --dry-run
```

## Decision / Outcome

*(filled in after completion)*