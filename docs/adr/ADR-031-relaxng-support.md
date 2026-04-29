# ADR-031: RelaxNG Support Strategy

**Status:** Proposed

---

## Context

RelaxNG (ISO/IEC 19757-2, OASIS standard) is a grammar-based XML schema language. It is considered more expressive than XSD for certain patterns and has a simpler conceptual model:

- **XML syntax** (`.rng`) — schema expressed as XML
- **Compact syntax** (`.rnc`) — non-XML, human-friendly alternative syntax

RelaxNG is used in some standards (e.g., DocBook, ODF, EPUB) but has lower industry adoption than XSD.

Key RelaxNG features that differ significantly from XSD:
- **Interleave** (`<interleave>`) — like `xs:all` but recursive and composable
- **Grammar patterns** — `<grammar>`, `<define>`, `<ref>` for recursive definitions
- **Data types** — pluggable datatype libraries (default: XML Schema Part 2 types)
- **Annotations** — carried in a separate namespace, not parsed

---

## Decision

### Separate implementation — completely new pipeline
RelaxNG has no structural overlap with the existing XSD pipeline. A new `RelaxNGValidator` class with its own parser and validation engine must be built from scratch:

- `RelaxNGPipelineParserImpl` — parses `.rng` XML into a `RelaxNGSchema` internal type
- `RelaxNGValidatorImpl` — validates an XML document against the parsed schema using RelaxNG's derivative-based algorithm (Brzozowski derivatives) or a simplified top-down recursive descent

### Compact syntax (`.rnc`)
The compact syntax requires a custom tokenizer and parser. This is a significant engineering effort and is **deferred** to a subsequent ADR (ADR-032). Initial implementation covers XML syntax only.

### Datatype library
The default RelaxNG datatype library is XSD Part 2 types. The `isValidBuiltinType` function from `builtinTypeCheck.ts` can be reused for type validation within RelaxNG, avoiding duplication.

### Public API
`src/index.ts` gains a new export: `RelaxNGValidator` with `validate(xml: string, schema: string): ValidationResult`. The schema string is assumed to be XML syntax (`.rng`).

### Deferred features
- Compact syntax (`.rnc`) — see ADR-032
- External references (`<externalRef>`, `<include>`) — depends on external document loading strategy
- Non-XML datatype libraries

### Prerequisite
ADR-029 (XPath evaluation) is **not** required for RelaxNG, as RelaxNG does not use XPath.

---

## Consequences

- **Positive:** RelaxNG support covers an important segment of schema-validated XML (DocBook, ODF, EPUB).
- **Positive:** The `isValidBuiltinType` function can be reused, avoiding duplication of type logic.
- **Negative:** RelaxNG requires an entirely new parsing and validation engine. This is the largest single engineering investment in the roadmap.
- **Negative:** RelaxNG's derivative-based validation algorithm is complex to implement correctly, especially for `interleave`. A thorough test suite against the RelaxNG test suite (James Clark's `testSuite.zip`) is essential.
- **Negative:** The compact syntax `.rnc` is commonly used in practice; shipping XML-syntax-only support may limit adoption.
