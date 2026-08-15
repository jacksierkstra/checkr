# Issue tracker: docs/backlog (custom)

Issues for this repo live as task briefs in `docs/backlog/`, indexed by `docs/backlog/ledger.json`.

## Conventions

- One brief per file: `docs/backlog/active/CHK-<NNN>-<slug>.md`
- Frontmatter: `id`, `title`, `area`, `priority`, `status`, `depends_on`, `required_context`, `optional_context`, `estimate` (see `docs/backlog/template.md`)
- Extra frontmatter fields for Wayfinder (`type`, `wayfinder_type`, `assignee`, `parent`) are additive — the validator ignores unknown fields.
- Terminal briefs (status `done`/`cancelled`/`superseded`) move to `docs/backlog/archive/` and the ledger is updated.
- Comments/conversation append to the bottom of the file under `## Comments`.

## Wayfinding operations

Used by `/wayfinder`. Both maps and tickets are briefs following the full template (required sections `Context`, `Deliver`, `Acceptance Criteria`, `Verification`), with extra Wayfinder-specific sections added.

### Map

- File: `docs/backlog/active/CHK-<NNN>-map-<slug>.md`
- Frontmatter: `type: "map"`, `area: "meta"`, `status: "draft"` (while active), `priority`, `depends_on: []`
- Required sections: `## Context`, `## Deliver`, `## Acceptance Criteria`, `## Verification` (satisfied minimally)
- Wayfinder sections: `## Destination`, `## Notes`, `## Decisions so far`, `## Not yet specified`, `## Out of scope`
- Stays in `active/` while the effort is live; archived with `status: done` when the route is clear.

### Child ticket

- File: `docs/backlog/active/CHK-<NNN>-<slug>.md`
- Frontmatter: `type: "ticket"`, `wayfinder_type: research | prototype | grilling | task`, `parent: CHK-<map-id>`, `status: "draft"`, `area: "meta"`, `depends_on: [...]`, `assignee: <dev>`
- Required sections: `## Context`, `## Deliver`, `## Acceptance Criteria`, `## Verification` (satisfied minimally)
- Wayfinder sections: `## Question` (the core question this ticket resolves), `## Answer` (appended on resolution)
- Blocking: `depends_on` lists brief IDs (e.g. `CHK-005, CHK-007`). A ticket is unblocked when every ID in `depends_on` has `status: done`.
- **Frontier**: scan `docs/backlog/active/` for briefs with `type: ticket`, `parent: <map-id>`, `status: draft`, and no unresolved blockers; first by ID number wins.
- **Claim**: set `status: in-progress` and `assignee: <dev>` in frontmatter, save before any work.
- **Resolve**: append answer under `## Answer`, set `status: done`, archive the file, update `ledger.json`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## Finish-backlog workflow

`/finish-backlog-workflow` implements open concrete leaf tickets one-by-one, each in a fresh context, with an independent verifier gating every commit. The canonical procedure is `docs/agents/commands/finish-backlog-workflow.md` (harness-agnostic); `.pi/prompts/` and `.claude/commands/` carry thin adapters.

- **Plan** — reads `ledger.json` + `active/` briefs, classifies concrete coding tasks (excludes maps, research, ADR/review gates, blocked tickets), returns them dependency-ordered.
- **Execute** — one fresh sub-agent per task (or sequential in-session): implements, updates frontmatter to `done`, fills `Decision/Outcome` + `Verification`, moves the brief to `archive/`, updates `ledger.json`. Never verifies itself, never commits — it declares `changedPaths` instead.
- **Stage** — a separate agent stages exactly the declared paths; the script audits that nothing else leaked.
- **Verify** — an independent verifier runs `node scripts/agent-check.mjs full` and reports raw exit codes; only a green `AGENT_CHECK_FULL_PASS` clears the task.
- **Commit** — a third agent commits the staged files. Stops on the first failing task, leaving changes staged for inspection.