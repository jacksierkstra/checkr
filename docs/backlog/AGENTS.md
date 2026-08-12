# Backlog conventions — docs/backlog/AGENTS.md

This file governs how agents read, write, and archive task briefs in this directory.

---

## Directory structure

```
docs/backlog/
  AGENTS.md       — this file
  ledger.json     — index of all briefs (active + archived)
  template.md     — canonical brief template
  active/         — briefs with status != done, cancelled, or superseded
  archive/        — terminal briefs (status: done, cancelled, superseded)
```

---

## Frontmatter fields

Every brief must have this frontmatter:

```yaml
---
id: CHK-001
title: Short title
area: core | validator | xsd | xml | benchmark | ops | meta
priority: critical | high | medium | low
status: draft | in-progress | review | done | cancelled | superseded
depends_on: []
required_context: []
optional_context: []
estimate: null
---
```

`id` prefix: **CHK** (from "checkr").

---

## Conventions

### Verification is written before implementation

The `Verification` section of every brief must contain runnable commands (e.g. `node scripts/agent-check.mjs test`) **before** any implementation work begins. These are the acceptance gate.

### Decision/Outcome is written after

The `Decision/Outcome` section is filled in **after** the task completes. It is the *only* thing a future task reads from a finished brief. Completed acceptance criteria are not active requirements.

### Must Follow / Do Not carry task-specific constraints only

Restating global rules from root `AGENTS.md` is forbidden. If a constraint is repo-wide, it goes in `AGENTS.md`.

### Planning limit

Before producing a plan, read no more than:
- The task brief
- One dependency brief (if any)
- Three docs

Exceeding this limit requires stating why first.

### Briefs are not architecture authority

A brief cannot override root `AGENTS.md` or canonical docs. If a brief contradicts either, stop and report the conflict.

### Terminal briefs move to archive

When a brief reaches `status: done`, `cancelled`, or `superseded`:
1. Move the file from `active/` to `archive/`
2. Update `ledger.json` (status + archive path)
3. If `done`, ensure `Decision/Outcome` and `Verification` are both non-empty

---

## Read order when loading a task

1. `docs/backlog/AGENTS.md` (this file)
2. The task brief file
3. `ledger.json` entries for `depends_on` briefs (only if they are still active)
4. Stop. Do not read completed briefs — their `Decision/Outcome` is the only thing that matters, and that is copied into the current brief if relevant.