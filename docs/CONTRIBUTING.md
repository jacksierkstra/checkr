# Contributing

## Prerequisites

- Node.js 20+
- npm (ships with Node.js)

## Setup

```sh
npm ci
```

## Commands

| Command | Description |
|---|---|
| `npm test` | Run the test suite (Jest) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run benchmark` | Run benchmarks |
| `npm run guardrails` | Run reuse guardrails checks |

## Project structure

```
src/
  lib/
    core/        — Two-phase API (compile, validate)
    types/       — Component graph, errors, namespaces
    validator/   — Instance validation logic
    xml/         — XML parsing and DOM helpers
    xsd/         — XSD compilation, facets, types, content models
docs/
  adr/           — Architecture Decision Records
  backlog/       — Task briefs and work tracking
  research/      — Research notes
```

## Guidelines

- All code is pure TypeScript (no native dependencies).
- Use `@lib/*` path aliases for imports within `src/`.
- Tests live next to their source files as `*.test.ts`.
- See `AGENTS.md` for the full agent operating instructions.