# ADR-024: Adopt Conventional Commits + Release Please

**Status:** Accepted  
**Supersedes:** [ADR-016](./ADR-016-release-strategy.md)

---

## Context

ADR-016's tag-driven release workflow has the following known problems:

- `package.json` version lags behind the published version between releases — the bump commit lands after publish, leaving `main` in a perpetually stale state.
- There is no CHANGELOG. Consumers must read commit history or GitHub release notes to understand what changed.
- No conventional commit format is enforced, making automated changelog generation impossible.
- No pre-release workflow exists.

---

## Decision

Adopt **[Conventional Commits](https://www.conventionalcommits.org/)** as the commit message format and **[Release Please](https://github.com/googleapis/release-please)** as the automated release management tool.

### How it works

1. Commits to `main` must follow the Conventional Commits format:
   - `feat: add sync validate() API` — triggers a minor version bump.
   - `fix: correct pattern validation for xs:restriction` — triggers a patch bump.
   - `feat!: replace string errors with structured ValidationError` — breaking change, triggers a major bump.
   - `chore:`, `docs:`, `test:`, `refactor:` — no version bump.

2. Release Please runs as a GitHub Actions workflow on every push to `main`. It maintains a **Release PR** that:
   - Bumps `package.json` version.
   - Updates `CHANGELOG.md` from the commit history since the last release.
   - Stays open and accumulates changes until a maintainer merges it.

3. Merging the Release PR triggers the publish workflow, which runs tests and publishes to npm.

### Enforcement

- `commitlint` (with `@commitlint/config-conventional`) is added as a CI check on all PRs.
- The existing manual tag-and-publish workflow (`npm-publish.yml`) is replaced by Release Please.

---

## Consequences

- **Positive:** `package.json` version on `main` is always correct — Release Please updates it before publish.
- **Positive:** `CHANGELOG.md` is auto-generated and kept up to date.
- **Positive:** Breaking changes are explicit in commit messages (`!` suffix or `BREAKING CHANGE:` footer) — no ambiguity about semver bumps.
- **Positive:** Pre-release versions (`alpha`, `beta`) are supported by Release Please configuration.
- **Negative:** Commit message discipline is required from all contributors. PRs with non-conforming commits are blocked by CI.
- **Negative:** Retroactive history does not conform to Conventional Commits format — the first auto-generated CHANGELOG entry will be incomplete.
- **Constraint:** Release Please requires a GitHub token with write access to `main` to open and update the Release PR. This must be configured in repository secrets.
