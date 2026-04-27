# ADR-016: GitHub release tag drives version bump and npm publish

**Status:** Accepted

---

## Context

The release and publishing workflow (`npm-publish.yml`) is triggered by GitHub release creation. The workflow:

1. Checks out `main`
2. Runs `npm ci` and `npm test`
3. Extracts the version number from the Git tag (e.g., `v0.0.18` → `0.0.18`)
4. Runs `npm version <version> --no-git-tag-version` to write the version into `package.json`
5. Commits the bump back to `main`
6. Runs `npm publish`

There is no CHANGELOG, no conventional commits enforcement, and no automated release notes generation. The version in `package.json` in the repository between releases may not match the last published version (the bump commit happens during publish).

Forces considered:

- **Simplicity:** The current workflow requires only creating a GitHub release. No local tooling, no scripts, no manual steps beyond the tag.
- **No CHANGELOG:** Consumers have no structured way to see what changed between versions without reading commit history or release notes written manually on GitHub.
- **Version drift:** Between releases, `package.json` shows the version from the previous publish until the next release is cut. This is confusing for contributors building locally.
- **No conventional commits:** Commit messages follow no enforced format, making automated changelog generation (e.g., via `conventional-changelog`) impossible without retroactive cleanup.
- **No pre-release / beta workflow:** There is no defined process for publishing a `0.0.x-beta.1` or `next` tag.

---

## Decision

Releases are triggered by creating a GitHub release with a semver tag (e.g., `v1.2.3`). The CI workflow extracts the version from the tag and publishes to npm.

No CHANGELOG, conventional commits, or automated release notes are required by the current process.

---

## Consequences

- **Positive:** Releasing requires only creating a GitHub release — no local tooling or manual version commands.
- **Positive:** The publish token (`NPM_PUBLISH_TOKEN`) is the only secret required; the workflow is self-contained.
- **Negative:** There is no CHANGELOG. Consumers must read GitHub release notes or commit history to understand what changed.
- **Negative:** The version in `package.json` on `main` lags behind the published version until the release CI commit lands.
- **Negative:** No conventional commits means automated changelog generation is not feasible without retroactive work.
- **Negative:** No pre-release workflow exists. Publishing a `next` or `beta` release requires manual changes to the workflow.
- **Recommendation:** Adopt [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and add [Release Please](https://github.com/googleapis/release-please) or [semantic-release](https://semantic-release.gitbook.io/) to automate CHANGELOG generation and version bumping. This would replace the current manual tag-driven workflow with one that derives the version from commit history.
