---
id: CHK-010
title: "Simple-type definitions and facet framework"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-008"]
required_context: ["docs/research/gap-analysis.md", "docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

The gap analysis rates checkr's simple-type support `partial` (four facets, string-only, UTF-16 length counting, no type hierarchy). The XSTS datatype sets (NIST ~3,953 groups, Microsoft DataTypes 2,247, SimpleType 340) are the largest scoring surface in the suite, and all of it hangs off simple-type definitions and facets. This ticket lays the framework: simple type definitions in the component graph with the facet machinery every built-in family then builds on.

## Deliver

`xs:simpleType` definitions (inline and global) compiling into typed simple type definitions with variety (atomic/list/union), a facet representation, whitespace normalization, and the length-family facets with correct code-point counting and facet inheritance down restriction chains.

## Acceptance Criteria

- [ ] `xs:simpleType` definitions (inline and global) compile into simple type definitions carrying variety and base type
- [ ] Facet framework parses and attaches facets to types; restriction chains inherit and re-constrain facets per XSD derivation rules
- [ ] `length`/`minLength`/`maxLength` count code points, not UTF-16 code units (the gap analysis flags `text.length` as wrong for supplementary characters)
- [ ] `whiteSpace` preserve/replace/collapse is applied before facet checks
- [ ] A simpleType restriction validates instance text end-to-end through the two-phase API

## Out of Scope

- Built-in type lexical/value spaces (CHK-011–014)
- The XSD regex dialect powering `pattern` (CHK-015)
- List/union item semantics (CHK-016)

## Dependencies

Blocked by CHK-008 (the component-graph core the types live in).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the simple-type/facet framework land on the component graph with code-point-correct length semantics and facet inheritance?

## Answer

Yes. The simple-type and facet framework landed on the component graph with code-point-correct length semantics and facet inheritance.

## Decision / Outcome

### Public surface

- **New module**: `src/lib/xsd/facets.ts` — facet framework with whitespace normalization (`normalizeWhiteSpace`), code-point counting (`codePointLength`), facet inheritance (`computeEffectiveFacets`, `computeWhiteSpace`), and facet validation (`validateFacets` for length family + enumeration).
- **Component graph**: `SimpleTypeDefinition` now carries `baseType` (resolved reference), `whiteSpace` (effective normalization mode), and `effectiveFacets` (after inheritance).
- **Built-in types**: `src/lib/xsd/compiler/builtinTypes.ts` updated with whiteSpace values and base-type chains for the string and numeric families. All built-ins have correct whiteSpace per XSD 1.0 Part 2 §4.3.6 (string → preserve, normalizedString → replace, token → collapse, all others → collapse).

### Compiler changes

- Pass 3 (new) resolves simple-type base references (`restriction/base`, `list/itemType`) and computes effective facets + whiteSpace for every simple type (global, inline, simpleContent). The resolution is bottom-up through the restriction chain, bottoming at built-in types (which are precomputed and frozen).
- `BuildContext.allSimpleTypes` collects every simple type built during pass 1 so pass 3 can process them.

### Validator changes

- `validateSimpleContent` now applies whitespace normalization and facet checks (length family, enumeration) to element text values.
- `validateComplex` case `"simple"` validates the text content against the simple type's facets.
- Attribute values are validated against their declaration's simple type facets.
- New error code `FACET_VIOLATION` added to the `SchemaErrorCode` union.

### Key design decisions

- **Code-point counting**: Uses `Array.from(value).length` instead of `value.length` to handle supplementary characters correctly (the gap analysis flags `text.length` as wrong).
- **Whitespace normalization**: Applied per the effective whiteSpace of the type (preserve/replace/collapse) before any facet check, matching XSD 1.0 Part 2 §4.3.6.
- **Facet inheritance**: Per XSD derivation rules: derived facets override base facets per kind; patterns accumulate across the chain; enumeration in derived replaces base's enumeration; whiteSpace inherits from base unless specified.
- **Numeric bounds (minInclusive, maxInclusive, minExclusive, maxExclusive, totalDigits, fractionDigits)** are attached to effective facets but not evaluated (CHK-012). **Pattern** is attached but not evaluated (CHK-015).

### Verification

All existing tests pass (51 tests), plus 15 new facet-framework unit tests, 7 new compiler integration tests, and 9 new end-to-end validator tests. `node scripts/agent-check.mjs full` → `AGENT_CHECK_FULL_PASS`.
