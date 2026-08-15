---
id: CHK-015
title: "XSD regex engine"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-010"]
required_context: ["docs/research/gap-analysis.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

`Regex_w3c.xml` is the single largest test set in the XSTS (2,591 groups, 1,586 instance tests), and the gap analysis rates the current state `missing`: the `pattern` facet compiles a JavaScript `RegExp`, whose semantics differ from the XSD regex dialect in Part 2 Appendix E (character-class subtraction, `\i`/`\c` name escapes, category/block escapes, no anchors/lookaround). This ticket replaces JS regex with a real XSD regex engine.

## Deliver

An XSD regex dialect engine (Part 2 Appendix E) that compiles `pattern` facet values and validates instance text per XSD semantics.

## Acceptance Criteria

- [ ] The dialect supports character-class subtraction `[a-z-[aeiou]]`, `\i`/`\c` name escapes, and category/block escapes, per Appendix E
- [ ] Anchors, lookaround, and backreferences — invalid in XSD regex — are rejected as schema errors, not silently mis-compiled
- [ ] Repetition and multi-character escapes behave per the spec, including the 1.0 restrictions (no multi-char escapes inside character classes)
- [ ] The `pattern` facet compiles through the engine and validates instance text end-to-end
- [ ] A representative slice of the Regex test set's behaviors passes checkr's internal tests

## Out of Scope

- The other facets (CHK-010, CHK-012)
- Unicode-category data beyond what the engine needs (document the target Unicode version per the gap analysis §5)

## Dependencies

Blocked by CHK-010 (the facet framework the engine plugs into).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can an XSD regex dialect engine (Appendix E) replace the JS-RegExp `pattern` implementation with XSD-correct semantics?

## Answer

Yes. An XSD regex dialect engine (Part 2 Appendix E) was implemented, replacing the JS-RegExp pattern placeholder with correct XSD semantics. The engine is in `src/lib/xsd/regex.ts` and supports:

- Character-class subtraction (`[a-z-[aeiou]]`), nested subtraction, and subtraction with negated classes
- `\i`/`\c` name-character escapes (XML NameStartChar \ NameChar minus `:` and `_`)
- Category escapes (`\p{L}`, `\p{Lu}`, `\p{Nd}`, etc.) via JS `\p{…}` Unicode property escapes with the `u` flag
- Block escapes (`\p{IsBasicLatin}`, `\p{IsCJKUnifiedIdeographs}`, etc.) via an embedded Unicode 17.0 block table
- Multi-character escapes (`\d`, `\D`, `\s`, `\S`, `\w`, `\W`, `\i`, `\I`, `\c`, `\C`) outside character classes
- Single-character escapes (`\n`, `\r`, `\t`, `\|`, `\.`, `\?`, `\*`, `\+`, `\{`, `\}`, `\$`, `\^`, `\[`, `\]`, `\(`, `\)`, `\-`, `\\`)
- Quantifiers: `?`, `*`, `+`, `{n}`, `{n,}`, `{n,m}` (XSD 1.0 grammar — no `{,n}`)
- Groups: `(…)`, `(?:…)` (non-capturing)
- Full-string matching semantics (implicit anchors)
- Rejection of JS-specific constructs: lookaround (`(?=…)`, `(?!…)`, `(?<=…)`, `(?<!…)`), backreferences (`\1`), flags (`(?i)`), and unknown escapes
- XSD 1.0 restriction: multi-character escapes inside character classes are rejected as schema errors
- `^` and `$` outside a class are treated as literal characters (correct per XSD spec grammar)

### Key design decisions

- **Backtracking matcher**: continuation-based (recursive for groups, iterative for single-char atoms) with full backtracking for alternation and quantifiers
- **Unicode version**: categories via the JS engine's `\p{…}` (V8's Unicode data); blocks via an embedded table from Unicode 17.0.0 (generated from UCD Blocks.txt)
- **Compile-time validation**: invalid patterns are caught at schema compilation time and reported as `INVALID_PATTERN` schema errors; the `patternCache` in `facets.ts` avoids repeated compilation
- **`{`-literal fallback**: a `{` not followed by a valid quantity is treated as a literal character (per spec note)
- **`^`/`$` as literals**: per the XSD 1.0 grammar, these are ordinary characters, not anchors

## Decision / Outcome

### Public surface

- **New module**: `src/lib/xsd/regex.ts` — XSD regex dialect engine with `compileXsdRegex(pattern: string): XsdRegex` and `XsdRegexError`
- **New data**: `src/lib/xsd/unicode-blocks.ts` — Unicode 17.0.0 block ranges (generated, 346 blocks)
- **New error code**: `INVALID_PATTERN` in `SchemaErrorCode` union

### Facet framework changes

- `validateFacets` in `src/lib/xsd/facets.ts` now evaluates `pattern` facets using the engine (previously a no-op)
- A module-level `patternCache` (`Map<string, XsdRegex>`) caches compiled patterns

### Compiler changes

- `checkPatternFacets` in `schemaCompiler.ts` validates all `pattern` facet values at schema compilation time, reporting `INVALID_PATTERN` errors with full location
- `readFacets` now returns the facet source element for error location

### Engine capabilities

- Full recursive-descent parser for the XSD 1.0 Part 2 Appendix E grammar
- Continuation-based backtracking matcher with full-string semantics
- Character class subtraction, union, negation, and complement
- Unicode categories via `RegExp` property escapes, blocks via embedded table
- XML NameChar name escapes (`\i`/`\c`/`\I`/`\C`) with hardcoded XML 1.0 ranges
- 1.0 restrictions: no multi-character escapes inside character classes, no `{,n}` quantifier

### Verification

All existing tests pass (473 tests, 10 suites). Regex engine unit tests: ~120 tests covering literals, full-string, dots, classes, subtraction, escapes, categories, blocks, quantifiers, groups, alternation, anchors-as-literals, error rejection, and the 1.0 restriction. End-to-end tests: 5 tests in the two-phase API (element text, attributes, compile-time rejection, subtraction, multiple patterns).

`node scripts/agent-check.mjs full` → `AGENT_CHECK_FULL_PASS`.