# ADR-001: Use TypeScript as the implementation language

**Status:** Accepted

---

## Context

Checkr is a validation library with a public API surface consumed by other TypeScript and JavaScript projects. It runs in two distinct environments — Node.js and browsers — and must interoperate with DOM APIs that exist in both.

Key forces:

- Contributors need to reason about the shape of XSD schema objects, XML DOM nodes, and validation results without referring to runtime values.
- The library exposes a non-trivial type hierarchy (`XSDElement`, `XSDRestriction`, `XSDExtension`, `ValidationResult`). Without static types, misuse is invisible until runtime.
- The XSD pipeline is composed of many small steps that must agree on shared contracts (`PipelineStep<Input, Output>`, `NodeValidationStep`, etc.). Interfaces enforce these contracts at compile time.
- JavaScript (plain ES modules) would require JSDoc annotations for equivalent type safety — a weaker, noisier alternative.

---

## Decision

Implement Checkr in **TypeScript** with strict mode enabled.

All shared contracts are defined as interfaces or types in `src/lib/types/` and imported via the `@lib/*` path alias. No types are inlined in implementation files.

---

## Consequences

- **Positive:** Mismatches between pipeline steps, schema types, and validators are caught at compile time rather than at runtime.
- **Positive:** Consumers of the library get accurate `.d.ts` declarations with no extra tooling.
- **Positive:** IDE tooling (autocomplete, rename, find-references) works correctly across the codebase.
- **Negative:** A build step (`tspc`) is required before publishing, adding pipeline complexity (see [ADR-010](./ADR-010-tspc-build.md)).
- **Negative:** Contributors unfamiliar with TypeScript face a learning curve.
