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
| [ADR-002](./ADR-002-single-runtime-dependency.md) | Use `@xmldom/xmldom` as the sole runtime dependency | Accepted |
| [ADR-003](./ADR-003-pipeline-xsd-parsing.md) | Pipeline pattern for XSD parsing | Accepted |
| [ADR-004](./ADR-004-pipeline-validation.md) | Pipeline pattern for validation | Accepted |
| [ADR-005](./ADR-005-error-as-values.md) | `validate()` never throws — errors as values ¹ | Accepted |
| [ADR-006](./ADR-006-modular-type-resolver.md) | Modular, interface-backed type resolver | Accepted |
| [ADR-007](./ADR-007-dual-namespace-lookup.md) | Dual namespace lookup pattern for DOM queries | Accepted |
| [ADR-008](./ADR-008-jsdom-test-environment.md) | Use `jest-environment-jsdom` as the test environment ¹ | Accepted |
| [ADR-009](./ADR-009-deferred-xsd-features.md) | Explicitly defer `xs:all`, `xs:key`, `xs:import`, `xs:group` | Accepted |
| [ADR-010](./ADR-010-tspc-build.md) | Use `ts-patch` (`tspc`) instead of plain `tsc` for builds | Accepted |
| [ADR-011](./ADR-011-async-api.md) | `validate()` returns a `Promise` despite a synchronous pipeline | Accepted |
| [ADR-012](./ADR-012-string-error-messages.md) | Error messages are plain strings — no error codes | Accepted |
| [ADR-013](./ADR-013-public-api-surface.md) | Implementation classes are part of the public API | Accepted |
| [ADR-014](./ADR-014-cjs-only-output.md) | CommonJS-only module output | Accepted |
| [ADR-015](./ADR-015-no-linter.md) | No linting or formatting toolchain | Accepted |
| [ADR-016](./ADR-016-release-strategy.md) | GitHub release tag drives version bump and npm publish | Accepted |

¹ Amended — see the "Known tensions" / "Decision" section of that ADR for corrections to the original reasoning.
