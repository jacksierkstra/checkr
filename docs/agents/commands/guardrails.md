# Guardrails — repo-specific reuse guardrails

Build or review the repo's reuse guardrails. Mode: **init** by default if no `guardrails.config.*` exists, else **review**. If you were invoked with an argument (`init` or `review`), use it.

You are building an enforcement mechanism, not doing an audit. Output is config + a check command wired into this repo. Follow the steps in order and respect the budgets — they exist to keep this cheap.

## 1. Fingerprint the repo (no source reading, ~6 commands max)

```
git ls-files | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -15
git ls-files | cut -d/ -f1-2 | sort -u | head -40
git ls-files -- '*package.json' '*pyproject.toml' go.mod Cargo.toml \
  '*.csproj' Gemfile composer.json build.gradle* | head
git ls-files | grep -iE 'eslint|biome|ruff|flake8|pre-commit|dependency-cruiser|import.?linter|archunit|\.editorconfig' | head
```

Read at most ONE manifest file, in full, and nothing else. Stop when you can name: language(s), package manager, test runner, lint/format tooling already present, and the top-level source layout.

## 2. Find the canonical modules from evidence, not from reading code

Import frequency is the signal — the thing everyone already imports is the thing new code should reuse:

```
# JS/TS
git ls-files '*.ts' '*.tsx' '*.js' | xargs grep -hoE "from ['\"][^'\"]+" \
  | sort | uniq -c | sort -rn | head -30
# Python
git ls-files '*.py' | xargs grep -hoE '^(from|import) [a-zA-Z_.]+' \
  | sort | uniq -c | sort -rn | head -30
# Go
git ls-files '*.go' | xargs grep -hoE '"[a-z0-9./-]+"' | sort | uniq -c | sort -rn | head -30
```

Then derive candidates:
- **Wrapper bypass** — an internal module wraps a dependency, but the raw dependency is still imported directly somewhere. Rule: ban the raw import.
- **Competing siblings** — two modules with overlapping names/purposes both imported. Rule: inventory + a note on which is canonical. Confirm with the user.
- **Layer leaks** — imports pointing the wrong way across your top-level dirs. Rule: boundary check.
- **Closed sets** — categories that should not grow silently: shared components, direct dependencies, env vars, routes, DB tables, feature flags. Rule: inventory baseline.

Cap: 12 candidates. Rank by number of files affected.

## 3. Pick the enforcement tool (native beats custom)

Prefer what the ecosystem already gives you, in this order:
1. A linter already installed here → add rules to its existing config.
2. The ecosystem's standard linter, if adding one dependency is acceptable.
3. A dependency-free script in the repo's primary language, as a last resort.

checkr currently has NO linter installed, so the last resort applies: `scripts/guardrails.mjs` is that script, and its extractors are fixture-tested in `scripts/guardrails.test.mjs` (run with `node --test scripts/guardrails.test.mjs`). If a linter is ever added, prefer it for import bans and keep the script for the closed-set inventories.

If you are not certain of the current rule syntax for the chosen tool, do at most 2 web fetches of its official docs — the rule reference page, not blog posts or tutorials. Do not fetch for a tool you already know cold.

## 4. Survey the user — ONE message, then wait

Present the candidates as a numbered list. For each: the rule in one line, the canonical target, the number of current violations, and a default (enforce / warn / skip). Group anything with zero current violations under "cheap to adopt". Ask them to reply with edits only.

Do not write any file before they answer.

## 5. Generate

- Write `guardrails.config.json` — the durable record of what is enforced and why, including which tool enforces each rule and how it is run.
- Write (or extend) the enforcement script: `scripts/guardrails.mjs` + `scripts/guardrails.test.mjs`. Keep extractors pure and exported so the tests drive them off fixture text rather than the live repo.
- Baseline the inventories via `node scripts/guardrails.mjs --update` — writes `scripts/guardrails/*.json`. Commit the command alongside the data so it can be re-derived.
- Scope the check: checkr is a small single-package repo, so a full scan is the default — no PR-relative scoping needed. The extractors walk `src/` (and read `package.json`) in milliseconds.
- Register one entry point using this repo's convention: a `guardrails` target in `scripts/agent-check.mjs` (which also runs the fixture tests and is part of `full`), plus the npm script `npm run guardrails`. Name both `guardrails`.
- Pre-existing violations go into an explicit ignore list with a TODO, never into a weakened rule. Ratchet down later; never fail the build on day one.

## 6. Prove it works

Run the check on HEAD → must exit 0.
Introduce one deliberate violation in a scratch file → must exit non-zero and name the file, line, and canonical target. Delete the scratch file.
A guardrail that has never been observed failing is not a guardrail.

## 7. Hand back

Report: tool chosen, rules active, violations ignored, how to run it. Then add this line to the repo's `AGENTS.md` (under the verification section or as a dedicated Guardrails section):

> Run `node scripts/agent-check.mjs guardrails` (or `npm run guardrails`) before finishing. It must exit 0. Do not edit the guardrails config or regenerate inventories to make it pass — report it.

---

## Review mode

Skip steps 3–5. Instead:
1. Run the check. Report current state.
2. Rules that have never fired since adoption → propose removing (noise).
3. Ignore-list entries now fixed → propose deleting the entry (ratchet).
4. Re-run step 2's frequency scan → propose rules for drift that appeared since.
5. Ask before changing anything. Same one-message survey format.