# ADR-030: Schematron Support Strategy

**Status:** Proposed  
**Related:** [ADR-029](./ADR-029-xpath-evaluation.md)

---

## Context

Schematron (ISO/IEC 19757-3) is a rule-based XML validation language. Unlike XSD, which validates structure and data types, Schematron validates business rules using XPath pattern matching:

```xml
<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron">
  <sch:pattern>
    <sch:rule context="invoice">
      <sch:assert test="total = sum(lineItem/price)">
        Invoice total must equal sum of line items.
      </sch:assert>
    </sch:rule>
  </sch:pattern>
</sch:schema>
```

Schematron is commonly used **alongside** XSD: XSD validates structure, Schematron validates business rules. Many enterprise XML ecosystems (HL7 FHIR, UBL, etc.) ship both XSD and Schematron schemas.

---

## Decision

### Separate top-level class
Schematron validation is implemented as a separate `SchematronValidator` class, **not** integrated into `Checkr` or `ValidatorImpl`. Rationale:
- Schematron and XSD are orthogonal concerns; mixing them in one class would violate the single-responsibility principle.
- Users who only need XSD validation should not pay for Schematron code.

### Public API extension
`src/index.ts` gains a new named export: `SchematronValidator`. Its `validate(xml: string, schematron: string): ValidationResult` method matches the existing `Checkr` API shape for consistency.

### Schematron parsing pipeline
A new `SchematronPipelineParserImpl` parses the Schematron document into an internal `SchematronSchema` type (patterns → rules → assertions/reports).

### Validation execution
For each `<sch:rule context="...">`, the validator:
1. Evaluates the `context` XPath against the XML document to find matching nodes.
2. For each matching node, evaluates each `<sch:assert test="...">` XPath.
3. Failed assertions produce `ValidationError` with a new code: `ASSERTION_FAILED`.

### XPath dependency
Uses the `XPathEvaluator` abstraction from ADR-029. XPath 1.0 covers most Schematron use cases. XPath 2.0 expressions will not be evaluated without the optional library (see ADR-029).

### Output format
`ValidationResult` (same as XSD) is used for output. SVRL (Schematron Validation Report Language) output is **out of scope** for the initial implementation.

### Supported Schematron features (initial scope)
- `sch:schema`, `sch:pattern`, `sch:rule`, `sch:assert`, `sch:report`
- `sch:title`, `sch:p` (informational — ignored)
- `sch:ns` (namespace declarations for XPath)

### Deferred Schematron features
- `sch:extends`, `sch:include` (external document loading — same concerns as `xs:include`)
- `sch:phase`, `sch:active` (phase-based validation)
- `sch:let` (variable bindings — requires XPath 2.0 `let`)
- Abstract rules and patterns
- SVRL output

---

## Consequences

- **Positive:** Schematron support is cleanly separated from XSD; both can evolve independently.
- **Positive:** The `ValidationResult` output type provides a consistent consumer experience across both validators.
- **Negative:** A new top-level export (`SchematronValidator`) expands the public API surface, which must be maintained.
- **Negative:** XPath evaluation quality directly determines Schematron correctness. XPath 1.0 limitations must be clearly documented.
- **Negative:** Schematron's flexible schema structure (nested patterns, abstract rules) is significantly more complex to parse than XSD's element-centric model.
