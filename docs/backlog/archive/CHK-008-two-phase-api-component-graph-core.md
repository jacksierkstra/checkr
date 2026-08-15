---
id: CHK-008
title: "Two-phase API and component-graph core"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: []
required_context: ["docs/adr/architecture-component-model.md"]
optional_context: ["docs/research/reference-xsd-validator-architectures.md", "src/lib/"]
assignee: null
estimate: null
---

## Context

The architecture decision (CHK-004, ADR at `docs/adr/architecture-component-model.md`) commits checkr to a typed component graph with a two-phase API: `compileSchema()` → immutable `CompiledSchema`, then `validate()` → `ValidationResult`, with errors reported through a listener-style `SchemaError` taxonomy. This is the foundation ticket: build that surface *beside* the existing pipeline so nothing breaks, per the expand step of the rearchitecture sequence.

## Deliver

A working two-phase API on a typed component graph for a minimal schema: one global element declaration with an inline simple or complex type, QName identity, eager compile-time resolution of type references, and a `SchemaError` taxonomy (severity, code, message, location, phase) delivered via a listener.

## Acceptance Criteria

- [ ] `compileSchema()` accepts an XSD document string and returns an immutable `CompiledSchema`; mutating the input after compile has no effect on the compiled schema
- [ ] `validate()` accepts an XML document against a `CompiledSchema` and returns valid/invalid plus a list of `SchemaError`s carrying severity, code, message, location, and phase
- [ ] A minimal schema (global element + inline type) compiles, and conforming / non-conforming instances validate correctly in both directions
- [ ] Unresolvable type references are compile-time errors, surfaced through the error listener (eager multi-pass resolution per ADR §5)
- [ ] The existing single-shot API keeps working unchanged — the current test suite still passes

## Out of Scope

- Schema-for-schemas conformance (later ticket)
- PSVI (explicitly deferred by the ADR)
- Any feature beyond the minimal compile/validate round trip

## Dependencies

None — can start immediately.

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the two-phase API and a minimal typed component graph land beside the existing pipeline with the current test suite staying green?

## Answer

Yes. The two-phase surface landed beside the legacy pipeline (`Checkr.validate` untouched) with all 182 tests green, including 47 new ones for the new surface. Design decisions recorded in Decision/Outcome below, with the implementation-defined scope notes for later tickets.

## Decision / Outcome

The two-phase API and minimal typed component graph landed as specified by the ADR, beside the legacy pipeline.

### Public surface

- `compileSchema(xsd: string, options?: { listener }) → CompiledSchema` and `validate(instance: string, schema: CompiledSchema, options?: { listener }) → SchemaValidationResult` are exported from `src/index.ts` (implementation in `src/lib/core/compiled.ts`). Synchronous, unlike the legacy async API.
- `CompiledSchema` is a `ReadonlyMap` of **grammars keyed by namespace** (grammar-per-namespace, AD §4), each holding global element declarations and type definitions keyed by local name. QName identity `{ns}localName` (AD §2).
- The graph is deep-frozen at the compile boundary (`deepFreeze`); the input XSD is a string so no live DOM reference escapes — mutation after compile has no channel into the compiled schema.

### Error taxonomy (AD §6)

- `SchemaError { severity: warning|error|fatal, code, message, location: {line, column}, phase: schema-compilation|instance-validation }`, delivered through an optional listener and also returned in the result.
- **Compile failure is an exception**: when compilation produces ≥1 `error`/`fatal` entry, `compileSchema` throws `SchemaCompilationError` carrying the full error list — the same entries were already delivered to the listener. This is the resolution of "fails compilation" vs "reported via listener" in the ADR: listener is the reporting channel, the throw is the control-flow signal.
- Codes introduced: `INVALID_SCHEMA_DOCUMENT`, `INVALID_INSTANCE_DOCUMENT`, `UNRESOLVED_TYPE`, `UNDECLARED_ELEMENT`, `UNEXPECTED_ELEMENT`, `MISSING_REQUIRED_ELEMENT`, `UNEXPECTED_TEXT_CONTENT`, `UNDECLARED_ATTRIBUTE`, `MISSING_REQUIRED_ATTRIBUTE`, `INVALID_ELEMENT_CONTENT`, `UNSUPPORTED_FEATURE`.

### Compilation (pass 1 register / pass 2 resolve)

- Pass 1 registers global elements, named complex/simple types in the target-namespace grammar; builds inline types recursively; collects every QName reference (element/attribute `type`, restriction `base`, list `itemType`, union `memberTypes`, `ref=`).
- Pass 2 resolves element and attribute type references against the grammars (built-ins + target namespace) and writes the resolved `type` into the declaration; all other references are checked for resolvability. **Forward references work** (names are registered before resolution). Unresolvable → `UNRESOLVED_TYPE` compile error with the source location.
- Built-in `xsd:*` types are registered as a frozen singleton grammar (`src/lib/xsd/compiler/builtinTypes.ts`) so resolution succeeds; their lexical/derivation semantics are **not** validated yet (facets are CHK-010..CHK-014).
- `elementFormDefault` / `attributeFormDefault` and per-declaration `form` are honoured for local names (default unqualified); global names always take the target namespace.

### Validation (phase 2)

- Root element looked up as a global declaration by QName; content validated recursively against the resolved type. Simple-content types reject element children; element-only/empty types reject non-whitespace character data; `xs:anyType`-like untyped elements accept anything.
- Content models: **sequence matching is greedy** (consume each particle in order up to `maxOccurs`, then flag unsatisfied `minOccurs` and leftover children). Documented limitation: no lookahead, so an out-of-order child is reported both missing and unexpected — proper content-model validation is CHK-018.
- `choice`/`all` groups, wildcards (`xs:any`), nested model groups and attribute wildcards compile (with a `warning` `UNSUPPORTED_FEATURE` to the listener) but validation reports `UNSUPPORTED_FEATURE` for them rather than guessing. `xs:simpleContent`/`xs:complexContent`/`ref=`/`xs:group`/`xs:attributeGroup` are compiled as approximations with warnings — derivation work is CHK-019/CHK-020/CHK-023.
- Attributes: required uses enforced, undeclared attributes rejected (`xml:*`, `xsi:*`, `xmlns:*` exempt); attribute value lexical checks deferred.

### Compatibility

Legacy single-shot pipeline (`Checkr`, `ValidatorImpl`, `XSDPipelineParserImpl`) is untouched; the full existing suite passes unchanged.

### Verification

`node scripts/agent-check.mjs full` → `AGENT_CHECK_FULL_PASS` (test 182/182, build, benchmark, validate-brief, guardrails).
