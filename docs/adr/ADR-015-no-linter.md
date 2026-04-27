# ADR-015: No linting or formatting toolchain

**Status:** Accepted

---

## Context

Checkr has no ESLint, Prettier, or similar toolchain configured. Code style is enforced only by TypeScript's compiler (`strict: true`) and by code review.

Common reasons to add a linter/formatter:

- **Consistency:** Enforces a single style across all contributors without relying on individual discipline.
- **Catch common mistakes:** ESLint rules can catch bugs (e.g., `no-floating-promises`, `@typescript-eslint/no-explicit-any`) that the TypeScript compiler does not.
- **Automated formatting:** Prettier eliminates formatting debates in code review.
- **CI enforcement:** Linting failures block merges without maintainer intervention.

Reasons to defer:

- **Toolchain overhead:** Each tool adds configuration files, devDependencies, and CI steps. For a small single-maintainer library, this overhead may exceed the benefit.
- **Friction for contributors:** A strict lint config with zero-tolerance rules can discourage quick contributions. Some rules require non-obvious fixes.
- **TypeScript already covers a lot:** `strict: true` catches `noImplicitAny`, strict null checks, and other common pitfalls.

Current known issues that a linter would catch:
- `validateNumericConstraints` in `type.ts` uses `schema: any`, escaping type safety.
- `console.warn(...)` inside a validation step side-steps the errors-as-values contract (see [ADR-005](./ADR-005-error-as-values.md)).
- No `no-floating-promises` enforcement, which is relevant given the `async` API (see [ADR-011](./ADR-011-async-api.md)).

---

## Decision

No linting or formatting toolchain is configured. TypeScript's `strict` mode is the only automated code quality gate.

---

## Consequences

- **Positive:** No additional tooling to maintain or configure. New contributors can start writing TypeScript without learning lint rules.
- **Positive:** No CI failures caused by formatting disagreements.
- **Negative:** Code style inconsistencies will accumulate across contributors (e.g., inconsistent use of semicolons, trailing commas, single vs. double quotes).
- **Negative:** Common bugs that ESLint rules would catch (`@typescript-eslint/no-explicit-any`, `no-floating-promises`) can slip through undetected.
- **Negative:** The `console.warn` and `any` issues noted above are known and unchecked.
- **Recommendation:** At minimum, add `@typescript-eslint/no-explicit-any` and `no-console` as ESLint rules. These are low-noise, high-value rules that would eliminate the two known issues above. A full Prettier config is optional but would prevent style drift as contributors increase.
