# AGENTS.md — checkr

This file governs how agents operate in the `@jacksierkstra/checkr` repository. It is loaded on every task.

---

## Instruction priority

When multiple sources contain instructions, apply this precedence. A higher-precedence source overrides a lower one on the same subject.

1. **Root `AGENTS.md`** (this file)
2. **Nested `AGENTS.md`** — currently none exist
3. **Task brief** — located in `docs/backlog/active/`
4. **`docs/` tree** — ADRs and design notes if they appear
5. **Existing source code and nearby tests**

If two sources disagree on a *relevant constraint*, or docs and code disagree, **stop and report the conflict** rather than silently picking one.

---

## Normative language

| Term | Meaning |
|------|---------|
| **must** / **never** | Absolute requirement or prohibition. A task that violates it is wrong. |
| **should** | Strong default. Deviating requires an explicit stated reason in the task output. |
| **may** | Optional. No consequence either way. |
| *Conditional qualifier* ("when affected") | Scopes a rule to changes that touch that concern. Not discretion to skip a guardrail. |

---

## Default read order

When starting a task, read sources in this order and **stop when** all of the following are known:

- The task goal
- The area(s) affected
- Relevant constraints (from AGENTS.md, task brief, or ADRs)
- The files likely to change
- The verification command (from `agent-check` targets)

Default sequence: this file → nearest nested `AGENTS.md` (if any) → task brief (if any) → `docs/` → existing code and tests in the affected area.

---

## Boundary rules

This is a **single-package repo** (`@jacksierkstra/checkr`). No inter-package boundaries exist. Code organisation under `src/lib/` is structural, not contractual.

---

## Generated files — never hand-edit

| Path | Generator | Command |
|------|-----------|---------|
| `dist/` | TypeScript compiler | `npm run build` (`tspc -p tsconfig.build.json`) |
| `coverage/` | Jest | `npm test` |

---

## Canonical verification

Run `node scripts/agent-check.mjs [target]`. The script is at `scripts/agent-check.mjs` with POSIX and PowerShell shims under the same name (no extension / `.ps1`).

### Verification matrix

| Change type | Smallest target | Protocol |
|---|---|---|
| Logic / test change | `node scripts/agent-check.mjs test` | Run targeted check → fix → re-run → finish with `full` |
| Build / config change | `node scripts/agent-check.mjs build` | Same |
| Benchmark change | `node scripts/agent-check.mjs benchmark` | Same |
| Backlog / brief change | `node scripts/agent-check.mjs validate-brief` | Same |
| Guardrails / dependency / import change | `node scripts/agent-check.mjs guardrails` | Same |
| Multiple areas / unsure | `node scripts/agent-check.mjs full` | Run full check → identify first failing target → re-run that target with output → fix → re-run targeted → re-run full |

### Guardrails

Reuse guardrails are enforced at `scripts/guardrails.mjs` and registered in `guardrails.config.json`:

- **npm dependencies** — closed set (inventory baseline in `scripts/guardrails/npm-dependencies.json`).
- **process.env keys** — closed set, warn-only (`scripts/guardrails/src-env-keys.json`).
- **src/lib layering** — invariant (no upward imports across the DAG).
- **relative imports** — invariant (non-test src uses `@lib/*` / `@benchmark/*` aliases only).

Run `node scripts/agent-check.mjs guardrails` (or `npm run guardrails`) before finishing. It must exit 0.
Do not edit the guardrails config or regenerate inventories to make it pass — report it.

**Failure protocol**: When a check fails, re-run only the *smallest* failing command with output visible (the shim already does this for individual targets). Fix. Re-run the targeted check. Finish with the full check.

---

## Definition of Done

A task is done when all acceptance criteria pass and the canonical verification succeeds. The task report must end with this exact block:

```md
Verification complete.

- Targeted check: PASS
- Full verification: PASS
- Passing output was not loaded into context
- No verification logs were created
```

---

## Harness improvement rule

If a task exposes stale instructions, a broken command, or a missing guardrail, fix it in the same change or report the exact gap.

---

## Backlog conventions

See `docs/backlog/AGENTS.md` for how task briefs are read, written, and archived.

## Agent skills

### Commands

Repo commands live as **harness-agnostic procedures** in `docs/agents/commands/` (plain markdown, no harness-specific runtime or frontmatter). Any harness can run them by reading the file and following it; harnesses with a native command mechanism get thin adapters pointing at the canonical docs:

| Command | What it does | Adapters |
|---|---|---|
| `/finish-backlog-workflow` | Implements open concrete leaf backlog tasks one-by-one with an independent verifier gating each commit | `.pi/prompts/finish-backlog-workflow.md`, `.claude/commands/finish-backlog-workflow.md` |
| `/guardrails` | Builds (init) or reviews (review) the repo's reuse guardrails | `.pi/prompts/guardrails.md`, `.claude/commands/guardrails.md` |

Invoke by name where the harness supports it (`/guardrails`, `/finish-backlog-workflow`), or read the canonical file in `docs/agents/commands/` and follow it.

### Issue tracker

Issues live as task briefs in `docs/backlog/` (frontmatter + `ledger.json`). Wayfinder maps and tickets follow the brief template with extra sections. No external PR triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles map to status values in the brief frontmatter (default strings). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.