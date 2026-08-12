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
| `dist/` | TypeScript compiler | `yarn build` (`tspc -p tsconfig.build.json`) |
| `coverage/` | Jest | `yarn test` |

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
| Multiple areas / unsure | `node scripts/agent-check.mjs full` | Run full check → identify first failing target → re-run that target with output → fix → re-run targeted → re-run full |

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