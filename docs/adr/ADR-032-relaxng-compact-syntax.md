# ADR-032: RelaxNG Compact Syntax (.rnc) Support

**Status:** Proposed  
**Depends on:** [ADR-031](./ADR-031-relaxng-support.md)

---

## Context

RelaxNG offers two syntaxes:
1. **XML syntax** (`.rng`) — a valid XML document; parseable with the existing `DOMParser`.
2. **Compact syntax** (`.rnc`) — a non-XML, human-friendly syntax that is widely used in practice.

The compact syntax is not XML and cannot be parsed with `DOMParser`. It requires a custom tokenizer and parser. Example:

```rnc
start = element addressBook { card* }
card = element card {
  element name { text },
  element email { text }
}
```

ADR-031 deferred compact syntax support to focus on XML syntax first.

---

## Decision

### Custom tokenizer and parser for `.rnc`
Implement a `RelaxNGCompactParser` in `src/lib/relaxng/compact/` that:
1. Tokenizes the compact syntax into a flat token stream (identifiers, punctuation, string literals, keywords).
2. Parses the token stream into the same `RelaxNGSchema` internal type used by the XML syntax parser.

Because both parsers produce the same `RelaxNGSchema` output, the `RelaxNGValidatorImpl` requires no changes.

### Format detection
`RelaxNGValidator.validate(xml, schema)` detects the schema format automatically:
- If the schema string starts with `<` (after trimming whitespace), parse as XML syntax.
- Otherwise, parse as compact syntax.
- An explicit `format: "xml" | "compact"` option may also be accepted.

### Grammar
The compact syntax grammar is formally specified in the RelaxNG specification (Annex C). The parser should follow this grammar precisely. Use a hand-written recursive descent parser (consistent with the library's no-external-tools stance).

---

## Consequences

- **Positive:** Compact syntax support significantly increases practical usability of RelaxNG validation.
- **Positive:** Reusing the `RelaxNGSchema` internal type means the validator is unchanged.
- **Negative:** A custom tokenizer/parser is non-trivial to implement and maintain. Edge cases in the compact syntax grammar (especially annotations and datatype declarations) are subtle.
- **Negative:** The compact syntax parser requires comprehensive tests against the official RelaxNG test suite compact-syntax examples.
