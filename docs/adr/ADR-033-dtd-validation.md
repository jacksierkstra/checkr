# ADR-033: DTD Validation Strategy

**Status:** Proposed

---

## Context

DTD (Document Type Definition) is the original XML validation mechanism, defined as part of the XML 1.0 specification. DTDs can be embedded inline in an XML document (`<!DOCTYPE>`) or referenced externally.

Some legacy systems and standards (e.g., older HTML, some government data standards) still use DTDs. However, DTD has significant limitations compared to XSD:
- No namespace support
- No data type validation (only element/attribute structure)
- Minimal occurrence constraints
- No inheritance or complex type system

### The core technical blocker
The native `DOMParser` API does **not** expose DTD validation results. It parses the DTD internally (when present) but does not surface validation errors in a standard way across browsers and Node.js environments. The `document.doctype` property provides access to the `DocumentType` node, but not to the declared element/attribute rules.

To implement DTD validation, Checkr would need one of:
1. A **custom DTD tokenizer and parser** (significant effort; ~1,000–2,000 lines for a conformant implementation)
2. A **third-party XML/DTD parser library** — conflicts with ADR-017 (zero runtime dependencies)

---

## Decision

DTD validation is **deferred indefinitely** due to:

1. **Low demand:** DTD usage is declining. XSD and Schematron cover the vast majority of modern XML validation needs.
2. **High implementation cost:** A conformant DTD parser is a significant engineering investment for limited return.
3. **Dependency conflict:** A third-party parser would break ADR-017's zero-runtime-dependency contract.
4. **Native API limitations:** `DOMParser` does not expose DTD validation; there is no lightweight path.

If user demand emerges, this ADR should be revisited. At that point, the preferred approach would be a custom DTD parser rather than a runtime dependency, to preserve the zero-dependency contract.

### If implemented in the future
A `DTDValidator` class would follow the same pattern as `SchematronValidator` and `RelaxNGValidator`:
- Separate top-level class, separately exported
- Same `validate(xml: string, dtd: string): ValidationResult` signature
- New `ValidationErrorCode` values as needed

---

## Consequences

- **Positive:** No additional complexity or dependencies are introduced.
- **Positive:** The decision is explicitly documented so future contributors understand the reasoning rather than attempting partial implementations.
- **Negative:** Users whose schemas are DTD-based cannot use Checkr for DTD validation. They should be directed to alternative tools.
