# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for **Checkr** — a TypeScript library that validates XML documents against XSD schemas.

Each ADR documents a significant architectural or design decision: the context that drove it, the decision itself, and its consequences. ADRs are immutable once accepted; superseded decisions get a new ADR rather than an edit.

## Format

All ADRs follow the [Michael Nygard template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):

- **Title** — short noun phrase
- **Status** — Proposed / Accepted / Deprecated / Superseded
- **Context** — forces and constraints that led to the decision
- **Decision** — what was decided
- **Consequences** — trade-offs, follow-on work, constraints imposed

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](./ADR-001-typescript.md) | Use TypeScript as the implementation language | Accepted |
| [ADR-002](./ADR-002-single-runtime-dependency.md) | Use `@xmldom/xmldom` as the sole runtime dependency | Superseded by [ADR-017](./ADR-017-native-domparser.md) |
| [ADR-003](./ADR-003-pipeline-xsd-parsing.md) | Pipeline pattern for XSD parsing | Accepted |
| [ADR-004](./ADR-004-pipeline-validation.md) | Pipeline pattern for validation | Accepted |
| [ADR-005](./ADR-005-error-as-values.md) | `validate()` never throws — errors as values ¹ | Superseded by [ADR-018](./ADR-018-throw-on-programmer-errors.md) |
| [ADR-006](./ADR-006-modular-type-resolver.md) | Modular, interface-backed type resolver | Accepted |
| [ADR-007](./ADR-007-dual-namespace-lookup.md) | Dual namespace lookup pattern for DOM queries | Superseded by [ADR-017](./ADR-017-native-domparser.md) |
| [ADR-008](./ADR-008-jsdom-test-environment.md) | Use `jest-environment-jsdom` as the test environment ¹ | Accepted |
| [ADR-009](./ADR-009-deferred-xsd-features.md) | Explicitly defer `xs:all`, `xs:key`, `xs:import`, `xs:group` | Accepted |
| [ADR-010](./ADR-010-tspc-build.md) | Use `ts-patch` (`tspc`) instead of plain `tsc` for builds | Accepted |
| [ADR-011](./ADR-011-async-api.md) | `validate()` returns a `Promise` despite a synchronous pipeline | Superseded by [ADR-019](./ADR-019-sync-and-async-api.md) |
| [ADR-012](./ADR-012-string-error-messages.md) | Error messages are plain strings — no error codes | Superseded by [ADR-020](./ADR-020-structured-validation-errors.md) |
| [ADR-013](./ADR-013-public-api-surface.md) | Implementation classes are part of the public API | Superseded by [ADR-021](./ADR-021-narrow-public-api.md) |
| [ADR-014](./ADR-014-cjs-only-output.md) | CommonJS-only module output | Superseded by [ADR-022](./ADR-022-esm-only-output.md) |
| [ADR-015](./ADR-015-no-linter.md) | No linting or formatting toolchain | Superseded by [ADR-023](./ADR-023-eslint-prettier.md) |
| [ADR-016](./ADR-016-release-strategy.md) | GitHub release tag drives version bump and npm publish | Superseded by [ADR-024](./ADR-024-conventional-commits-release-please.md) |
| [ADR-017](./ADR-017-native-domparser.md) | Migrate to native `DOMParser` — remove `@xmldom/xmldom` | Accepted |
| [ADR-018](./ADR-018-throw-on-programmer-errors.md) | Throw on programmer errors — preserve errors as values for validation failures | Accepted |
| [ADR-019](./ADR-019-sync-and-async-api.md) | Expose both `validate()` (sync) and `validateAsync()` (async) | Accepted |
| [ADR-020](./ADR-020-structured-validation-errors.md) | Structured validation errors with codes | Accepted |
| [ADR-021](./ADR-021-narrow-public-api.md) | Narrow public API — export only `Checkr` and the public validation types | Accepted |
| [ADR-022](./ADR-022-esm-only-output.md) | ESM-only module output | Accepted |
| [ADR-023](./ADR-023-eslint-prettier.md) | Add ESLint + Prettier toolchain | Accepted |
| [ADR-024](./ADR-024-conventional-commits-release-please.md) | Adopt Conventional Commits + Release Please | Accepted |

¹ Amended — see the "Known tensions" / "Decision" section of that ADR for corrections to the original reasoning.
