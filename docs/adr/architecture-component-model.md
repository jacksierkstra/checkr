# XSD processor architecture: typed component model with two-phase compile/validate

Checkr's current pipeline-based architecture (linear transformation from XML DOM to `XSDElement[]`, then a validator walk) cannot express the full XSD 1.0 component model — type derivations, substitution groups, identity constraints, model groups, wildcards. We are rearchitecting checkr's XSD processor as a typed component graph with an eager, multi-pass schema compilation phase producing an immutable compiled schema, followed by a separate instance validation phase. This follows the pattern common to both reference validators studied (Xerces-J and libxml2) and mirrors the XSD 1.0 spec Part 1's own structure.

## Decisions

### 1. Component model structure

Adopt a **typed component graph** matching the XSD spec Part 1 components, expressed in TypeScript as a discriminated union of interfaces:

- **Type definitions** — `SimpleTypeDefinition` (variety: atomic/list/union; facets) and `ComplexTypeDefinition` (content type: element-only/simple/mixed/empty; particle tree; attribute uses; attribute wildcard; `isAbstract`)
- **Element declarations** — global (top-level, referenceable) and local (scoped to a type); each with type reference, substitution-group affiliation, `nillable`, `abstract`, constraints
- **Attribute declarations** and **attribute group definitions**
- **Model group definitions** — named groups holding particle trees of compositors (`sequence`, `choice`, `all`)
- **Particles** — wrap an element, model group, or wildcard with `minOccurs`/`maxOccurs`
- **Wildcards** — `xs:any` / `xs:anyAttribute` with namespace constraint and process-contents
- **Identity constraints** — `key`, `unique`, `keyref` with selector and fields
- **Notation declarations** and **annotations**

This is the model both Xerces-J (`SchemaGrammar`, `XSTypeDefinition`, `XSComplexTypeDefinition`, …) and libxml2 (structs on `xmlSchemaPtr`) converge on; it maps directly to the spec's component definitions, so spec clauses and test-suite behavior translate 1:1 into code.

### 2. Cross-references: QName resolution and identity

Named components are identified by **QName `{namespaceURI}localName`**. Lookup is via a map keyed by QName (per grammar, see §4) for O(1) resolution. **Anonymous components** (local types, unnamed model groups) get a synthesized identity derived from their parent's QName and position (e.g. `{ns}ParentType/anonymousType`), mirroring how Xerces-J synthesizes names for anonymous `XSObject`s; they are also reachable by position within their parent.

### 3. Two-phase architecture

The public API boundary is the phase split:

- **Phase 1 — schema compilation**: parse `.xsd` documents → resolve `include`/`import`/`redefine` recursively → build the component graph → resolve QName references (multi-pass, §5) → build substitution-group hierarchies → validate the schema (§7) → produce an **immutable, reusable, cacheable `CompiledSchema`**.
- **Phase 2 — instance validation**: walk the XML tree depth-first → resolve each element's declaration (including substitution-group affiliation and `xsi:type` overrides) → validate content against the type definition (particles, attribute uses, facets) → evaluate identity constraints → report errors via the error listener (§6).

The compiled schema is immutable and shared; mutable per-document state (element/type stacks, identity-constraint value tables) lives in the validation context, mirroring Xerces-J's immutable-grammar/thread-safe-validation-context split and libxml2's `xmlSchemaValidCtxtPtr`. Both reference validators use this separation — it is the canonical pattern and the reason instance validation stays fast and predictable.

### 4. Namespace organization: grammar-per-namespace

Each target namespace maps to one **grammar** holding that namespace's global components. `xs:import` creates a foreign grammar; `xs:include` merges documents into the same namespace's grammar. Rationale: matches the XSD spec's conceptual model (a namespace is a self-contained collection of global components), keeps QName resolution natural (`{ns}name` → grammar for `ns` → lookup `name`), and follows Xerces-J's cleaner `SchemaGrammar` model over libxml2's flat lists with per-component namespace flags, which muddy the namespace boundary for no gain in TypeScript.

### 5. Reference resolution: eager, multi-pass

All references are resolved eagerly at compile time in passes — pass 1 registers all component names, pass 2 resolves type references, pass 3 resolves structural references (substitution groups, model groups, attribute groups), pass 4 resolves identity-constraint `keyref/@refer`. Forward references work because names are registered before any resolution. **Unresolvable references are compile-time errors** — a schema that doesn't resolve is malformed and fails compilation, not validation. This follows Xerces-J's eager multi-pass `XSDHandler` model; lazy resolution (libxml2's deferred type resolution) was rejected as added complexity without benefit for a TypeScript implementation.

### 6. Error handling taxonomy

A single `SchemaError` type (discriminated union) with:

- **Severity**: `warning | error | fatal`
- **Code**: string enum key per error (e.g. `UNRESOLVED_TYPE`, `INVALID_FACET`, `CVC_TYPE_VALID`)
- **Message**: human-readable, parameterized
- **Location**: `{ line, column, file?, systemId? }`
- **Phase**: `schema-compilation | instance-validation`

Errors are reported through a **callback/listener pattern** (Xerces-J's `ErrorHandler` style) rather than thrown, so validation continues after non-fatal errors and reports all issues in one pass — matching both reference validators' error recovery (continue unless fatal). Compilation and validation have distinct error-code categories, like Xerces-J's `SchemaMessages` vs `XMLMessageProvider` and libxml2's `XML_SCHEMAP_*` vs `XML_SCHEMAV_*`.

### 7. Schema validation: schema-for-schemas at compile time

The compiled schema is validated against the schema-for-schemas rules during compilation (circular type derivations, invalid facet combinations, invalid derivation, abstract-component misuse, etc.). A malformed schema is a compilation error, never a confusing instance-validation error. Both reference validators validate schemas as part of compilation; this is essential for correctness and keeps instance-validation errors unpolluted by schema errors. The schema-for-schemas is the XSD language's own definition, which checkr will need to express internally as a bootstrap schema.

### 8. PSVI: none in the core, hook kept

No formal PSVI (Post Schema Validation Infoset) in the core for now — validation returns a boolean result plus the error list. Rationale: the XSTS only asserts valid/invalid outcomes, and PSVI is downstream-consumer sugar; building it first would delay core validation. However, the validation internals retain the typed value and effective type per validated node so a PSVI layer can be added later without rework. This sits between Xerces-J (first-class `PSVIProvider`) and libxml2 (none) deliberately.

## Considered options

- **Flat struct model (libxml2)** — rejected for §4: per-component namespace flags blur the namespace boundary; grammar-per-namespace is cleaner and spec-aligned.
- **Lazy reference resolution (libxml2)** — rejected for §5: defers failures to validation time and complicates state management for no benefit in TypeScript.
- **Formal PSVI now (Xerces-J)** — deferred for §8: not needed for XSTS compliance; internal hooks keep the option open.

## Consequences

- Checkr's existing pipeline model (`XSDElement[]` → validator walk) is replaced by the compile/validate split; this is a rearchitecture, per the map's architecture policy, not a force-fit of features into the current pipeline.
- Schema compilation becomes the natural home for schema validation (§7), reference resolution (§5), and substitution-group construction — instance validation stays free of reference-resolution surprises.
- The immutable `CompiledSchema` boundary makes the future test runner (separate repo) simple: compile once, validate many instances.
- Identity-constraint evaluation (§1) requires the XPath subset evaluator for selectors/fields — a known complex piece deferred to feature work, not this decision.
