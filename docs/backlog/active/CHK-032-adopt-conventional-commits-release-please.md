---
id: CHK-032
title: "Adopt Conventional Commits + Release Please"
area: "ops"
priority: "high"
status: "draft"
depends_on: ["CHK-029", "CHK-030", "CHK-031"]
required_context: []
optional_context: []
estimate: null
---

## Context

`main` replaced the manual tag-and-publish workflow with **Release Please** + Conventional Commits (see `main` branch `.github/workflows/release-please.yml`, `commitlint.config.js`, `CHANGELOG.md`, `docs/adr/ADR-024-conventional-commits-release-please.md`, and the `commitlint` CI job in `ci.yml`). The old `npm-publish.yml` (release-tag-driven, bumps version after publish, no CHANGELOG) has known problems documented in main's ADR-016/ADR-024.

`develop` is now canonical, still uses the old `npm-publish.yml` workflow, and has no commitlint. Port the Release Please setup from main, adapted to develop's branch flow.

Reference: `main` branch workflow files, `commitlint.config.js`, ADR-024.

## Must Follow

- **Branch adaptation (critical)**: main's workflow triggers on pushes to `main`. Since `develop` is canonical, adapt the trigger — either `on.push.branches: ["develop"]` on the release-please job, or a `release-please-config.json` that targets `develop`. State the chosen option in the Decision/Outcome. The publish job must `npm ci`, `npm test`, and `npm publish` with `NPM_PUBLISH_TOKEN` (port from main, keeping the `checkout` of the release tag).
- Add `commitlint` (`@commitlint/cli`, `@commitlint/config-conventional` from main) and `commitlint.config.js` extending `@commitlint/config-conventional`.
- Add the `commitlint` job to `.github/workflows/ci.yml` (port main's job: `npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose`).
- Delete `.github/workflows/npm-publish.yml` (superseded; main removed it in commit `84ad7c1`).
- Add `CHANGELOG.md` (Release Please maintains it; seed with a note that history prior to this change is not conventional-commits conformant).
- Record the decision in `docs/adr/` following the repo's ADR convention (e.g. `docs/adr/release-strategy.md`), noting what was adapted from main's ADR-024 and why.
- Update `scripts/guardrails/npm-dependencies.json` via `node scripts/guardrails.mjs --update`.
- Versioning baseline: `package.json` on develop is `0.0.18`; the next release version is derived by Release Please from conventional commits after this lands — do not hard-code a version.

## Do Not

- Do not retroactively rewrite git history to conform to Conventional Commits.
- Do not port main's ESM-only changes or anything beyond the release tooling.
- Do not publish anything as part of this task; the workflow is delivered but not triggered (no release PR is opened by the task itself).
- Do not hand-edit the guardrails inventory.

## Deliver

- `.github/workflows/release-please.yml` (adapted to develop), deleted `npm-publish.yml`.
- `commitlint.config.js`, updated `ci.yml` with commitlint job.
- `CHANGELOG.md` seeded.
- ADR file in `docs/adr/` documenting the release strategy decision.
- Updated `package.json` (devDeps + scripts if needed), `package-lock.json`, guardrails inventory.

## Acceptance Criteria

- [ ] `release-please.yml` exists and triggers on the canonical branch (develop), with a publish job that runs `npm ci`, `npm test`, `npm publish`.
- [ ] `npm-publish.yml` is deleted.
- [ ] `npx commitlint --from HEAD~1 --to HEAD` passes on a conventional commit and fails on a non-conventional one (sanity check locally).
- [ ] CI includes the commitlint job on PRs.
- [ ] ADR documents the branch adaptation and the choice between workflow-trigger vs release-please-config targeting.
- [ ] `node scripts/agent-check.mjs full` passes.

## Out of Scope

- Triggering an actual release or opening the first Release PR.
- Retroactive changelog generation for pre-conventional history.
- Pre-release (alpha/beta) tag configuration — note in ADR as a possible future extension.

## Risks

- **Branch-flow mismatch**: Release Please is main-centric; if the canonical branch stays `develop` but PRs merge into `main` sometimes, releases could double-fire. Mitigation: pick one trigger source and document it.
- **Secrets**: `NPM_PUBLISH_TOKEN` must exist in repo secrets (verify once, note in Outcome).
- **commitlint blocking**: existing PRs with non-conventional commits will fail CI until reworded; call this out to contributors.

## Dependencies

- CHK-029 (npm) — publish job uses `npm ci`.
- CHK-030 (Vitest) — publish job's `npm test` runs Vitest after this lands.
- CHK-031 (ESLint/Prettier + commitlint deps share tooling) — commitlint installs via npm; sequencing after 031 keeps dependency-inventory updates in one pass.

## Verification

```
node scripts/agent-check.mjs full
node scripts/validate-brief.mjs
npx commitlint --from HEAD~1 --to HEAD   # sanity: passes on a conventional commit
```

## Decision / Outcome

*(filled in after completion)*