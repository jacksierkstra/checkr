# Tickets: XSD 1.0 Spec Compliance

A set of tracer-bullet tickets to bring `@jacksierkstra/checkr` to full XSD 1.0 spec compliance, measured by passing the W3C XML Schema Test Suite (XSTS) for Parts 1 and 2 — both schema and instance validation.

Work the **frontier**: any ticket whose blockers are all done. Tickets in Phase 1 can start immediately.

---

## Phase 1: Foundational Research (AFK)

### CHK-002 — Research the XSTS structure and acquisition

**What to build:** A markdown document answering: where is the XSTS hosted, how is it organised, what is the manifest format, how are expected results encoded, how many tests, known issues, license.

**Blocked by:** None — can start immediately.

- [ ] Markdown summary covers acquisition, structure, manifest format, expected results, test counts, known issues, license
- [ ] Summary includes concrete URLs, commands, or file paths to acquire the suite

### CHK-003 — Research reference XSD validator architectures

**What to build:** A markdown document answering: how do Xerces-J and libxml2 implement XSD 1.0, what are their key components, how do they separate schema compilation from instance validation, how do they handle errors, how do they integrate with the XSTS.

**Blocked by:** None — can start immediately.

- [ ] Markdown summary covers all seven research questions
- [ ] Summary includes concrete class names, architecture patterns, or diagrams

---

## Phase 2: Key Decisions (HITL)

### Decide the component model architecture for checkr

**What to build:** A concrete architecture plan for checkr's new component model: schema components (element declarations, type definitions, model groups, identity constraints, etc.), how they reference each other, compilation vs validation phases, type system, error handling approach. This is a grilling session.

**Blocked by:** CHK-003 — Research reference XSD validator architectures

- [ ] Architecture plan is documented (as an ADR or in the ticket answer)
- [ ] Plan enumerates the key components and their relationships
- [ ] Plan separates schema compilation from instance validation
- [ ] Plan defines the error model (error codes, messages, severity)

### Decide the test runner design

**What to build:** A design for the separate `@jacksierkstra/checkr-xsts-runner` repo: CLI vs library API, how it parses XSTS manifests, how it feeds cases through checkr, how it compares results, reporting format. A prototype/grilling session.

**Blocked by:** CHK-002 — Research the XSTS structure and acquisition

- [ ] Design doc or prototype covers manifest parsing, test execution, result comparison, reporting
- [ ] Design specifies the repo name, structure, and API surface

---

## Phase 3: Infrastructure

### Build the XSTS test runner repo

**What to build:** A working TypeScript CLI tool (in a new repo under `@jacksierkstra`) that can acquire the XSTS, parse its manifests, run each test case through checkr, compare results against expected values, and report pass/fail. The measurement instrument for all subsequent work.

**Blocked by:** Decide the test runner design

- [ ] XSTS can be acquired (downloaded or referenced)
- [ ] Manifests are parsed correctly
- [ ] Test cases run through checkr and results are compared to expected
- [ ] A summary report (pass/fail/skip) is produced
- [ ] The tool is usable from the command line

---

## Phase 4: Rearchitecture (expand–contract)

### Expand: Add component model alongside existing pipeline

**What to build:** The new component-model classes (element declarations, type definitions, model groups, etc.) and a schema compiler that builds the component graph from an XSD document. The old pipeline remains untouched — nothing breaks, nothing changes behaviour. This is the expand step of the wide refactor.

**Blocked by:** Decide the component model architecture for checkr

- [ ] New component model classes exist and are typed
- [ ] Schema compiler produces a component graph from valid XSD
- [ ] Old pipeline still handles all validation — no behaviour change

### Port: Basic built-in types and facets

**What to build:** `xs:string`, `xs:integer`, `xs:decimal`, `xs:boolean`, `xs:date`, `xs:time`, `xs:dateTime`, `xs:anyURI`, `xs:QName`, etc. plus all facets (enumeration, pattern, length, minLength, maxLength, minInclusive, maxInclusive, minExclusive, maxExclusive, totalDigits, fractionDigits, whiteSpace, etc.) are validated through the new component model instead of the old pipeline.

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] All 44 built-in XSD 1.0 types are supported
- [ ] All facets are validated correctly
- [ ] Old handling of these types can be removed (or skipped)
- [ ] All existing tests still pass

### Port: Model groups (sequence, choice, all)

**What to build:** `xs:sequence`, `xs:choice`, `xs:all` model group definitions and their validation (order, choice exclusivity, unordered for `all`, occurrence constraints) are handled by the new component model.

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] `xs:sequence` validates correct ordering and occurrence
- [ ] `xs:choice` validates exclusivity (exactly one of the options)
- [ ] `xs:all` validates unordered occurrence
- [ ] Model group references (`<xs:group ref="...">`) work
- [ ] All existing tests still pass

### Port: Element declarations and substitution groups

**What to build:** Global and local element declarations, element references, substitution groups (head element, substitution group membership, substitution group validation) are handled by the new component model.

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] Global element declarations resolve correctly
- [ ] Local element declarations work
- [ ] Element references (`<xs:element ref="...">`) work
- [ ] Substitution groups: head element declaration, substitution group membership, validation of substituted elements
- [ ] All existing tests still pass

### Port: Attribute declarations and attribute groups

**What to build:** Attribute declarations, use (required/optional/prohibited), fixed/default values, `xs:attributeGroup` definitions and references are handled by the new component model.

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] Attribute declarations parse correctly
- [ ] `use`, `fixed`, `default` are enforced
- [ ] Attribute group definitions and references work
- [ ] All existing tests still pass

### Port: Simple type derivation (restriction, list, union)

**What to build:** Deriving simple types from built-in or other simple types via `xs:restriction`, `xs:list`, and `xs:union` — including facet inheritance and constraining facets.

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] `xs:restriction` on simple types with facets works
- [ ] `xs:list` derives list types from atomic types
- [ ] `xs:union` derives union types from multiple atomic/list types
- [ ] Facet inheritance and constraining facet rules are followed
- [ ] All existing tests still pass

### Port: Complex type derivation (extension, restriction)

**What to build:** Deriving complex types from other complex or simple types via `xs:extension` (adding attributes and elements) and `xs:restriction` (narrowing content model and facets).

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] `xs:extension` from complex types works (adds elements and attributes)
- [ ] `xs:extension` from simple types works (simple content)
- [ ] `xs:restriction` of complex types works (narrows content model)
- [ ] Type derivation hierarchies are resolved correctly
- [ ] All existing tests still pass

### Port: Identity constraints (key, unique, keyref)

**What to build:** `xs:key`, `xs:unique`, and `xs:keyref` identity constraints — including XPath subset parsing (`<xs:selector>`, `<xs:field>`), scope resolution, and validation (unique within scope, key requires presence, keyref references existing key).

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] `xs:unique` validates uniqueness of field values within a selector scope
- [ ] `xs:key` validates uniqueness AND presence
- [ ] `xs:keyref` validates that referenced key values exist
- [ ] XPath subset for selector and field is correctly parsed
- [ ] All existing tests still pass

### Port: Wildcards (any, anyAttribute)

**What to build:** `xs:any` and `xs:anyAttribute` wildcards — including `processContents` (strict, lax, skip), namespace constraints, and lax validation of wildcard-matched elements/attributes.

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] `xs:any` with `processContents="strict"` validates matched elements
- [ ] `xs:any` with `processContents="lax"` validates matched elements when possible
- [ ] `xs:any` with `processContents="skip"` skips validation
- [ ] `xs:anyAttribute` works similarly for attributes
- [ ] Namespace constraint (`namespace` attribute) is enforced
- [ ] All existing tests still pass

### Port: Notations

**What to build:** `xs:notation` declarations — parsing notation declarations, matching notation values in attributes and element content.

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] Notation declarations parse correctly
- [ ] Notation values are validated in attributes/elements that reference them
- [ ] All existing tests still pass

### Port: Schema composition (import, include, redefine)

**What to build:** Multi-schema namespace resolution: `xs:import` (types from other namespaces), `xs:include` (schemas in the same namespace), `xs:redefine` (redefine types from included schemas). Schema merging and chameleon namespaces.

**Blocked by:** Expand: Add component model alongside existing pipeline

- [ ] `xs:import` loads schemas from other namespaces
- [ ] `xs:include` merges schemas in the same namespace
- [ ] `xs:redefine` redefines types from included schemas
- [ ] Chameleon includes (no-targetNamespace include) work
- [ ] All existing tests still pass

### Contract: Remove old pipeline

**What to build:** Remove the old pipeline code (XSDPipelineParserImpl, old validation steps, old type definitions). Nothing should break because the new component model covers everything.

**Blocked by:** All port tickets (basic types, model groups, elements, attributes, simple derivation, complex derivation, identity constraints, wildcards, notations, schema composition)

- [ ] Old pipeline code is removed
- [ ] All existing tests still pass
- [ ] The public API is unchanged or improved

---

## Phase 5: Schema Validation

### Implement schema validation

**What to build:** Checkr validates the XSD document itself against the schema-for-schemas (the formal XSD definition). Invalid schemas are rejected with meaningful errors.

**Blocked by:** Decide the component model architecture for checkr

- [ ] Schema-for-schemas validation is implemented
- [ ] Invalid schemas produce clear error messages
- [ ] Valid schemas pass schema validation
- [ ] All existing tests still pass

---

## Phase 6: XSTS Compliance

### XSTS integration: first green run

**What to build:** Wire the XSTS test runner to the rearchitected checkr. Run the full XSTS, establish a baseline pass rate. Triage the failures by category.

**Blocked by:** Build the XSTS test runner repo, Contract: Remove old pipeline, Implement schema validation

- [ ] Full XSTS can be run via the test runner
- [ ] Baseline pass rate is measured and recorded
- [ ] Failures are triaged by feature area / XSTS category

### Fix XSTS failures: basic types and facets

**What to build:** Fix all remaining XSTS failures in the basic types and facets category. Each fix is a vertical slice through the type system.

**Blocked by:** XSTS integration: first green run

- [ ] All basic type and facet XSTS test cases pass

### Fix XSTS failures: model groups

**What to build:** Fix all remaining XSTS failures in the model groups category (sequence, choice, all).

**Blocked by:** XSTS integration: first green run

- [ ] All model group XSTS test cases pass

### Fix XSTS failures: type derivation

**What to build:** Fix all remaining XSTS failures in the simple and complex type derivation categories.

**Blocked by:** XSTS integration: first green run

- [ ] All type derivation XSTS test cases pass

### Fix XSTS failures: identity constraints

**What to build:** Fix all remaining XSTS failures in the identity constraints category (key, unique, keyref).

**Blocked by:** XSTS integration: first green run

- [ ] All identity constraint XSTS test cases pass

### Fix XSTS failures: remaining features

**What to build:** Fix all remaining XSTS failures — substitution groups, wildcards, notations, schema composition, attribute groups, and any other categories.

**Blocked by:** XSTS integration: first green run

- [ ] All remaining XSTS test cases pass
- [ ] Full XSTS pass rate is 100% (or documented exceptions for known XSTS issues)