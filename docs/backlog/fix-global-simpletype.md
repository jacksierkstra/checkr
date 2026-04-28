# fix-global-simpletype: Global xs:simpleType nodes are silently discarded

| Field    | Value    |
|----------|----------|
| Type     | bug      |
| Priority | critical |
| Status   | done     |

## Problem

`DocumentExtractor.extractTopLevelSchemaNodes` filters top-level schema children to only `localName === "element"` or `localName === "complexType"`. Top-level `xs:simpleType` declarations (e.g., named `AgeType`) are silently dropped and never stored in `schema.types`.

As a consequence, any `type="AgeType"` reference on an element cannot be resolved — the type resolver finds nothing and the constraints defined in the simpleType are never applied.

**Affected files:**
- `src/lib/xsd/utils/documentExtractor.ts` → `extractTopLevelSchemaNodes()`
- `src/lib/xsd/pipeline/parser.ts` → `parse()`

The `docs/type-system.md` usage example demonstrates this exact pattern as "working", but it silently fails today.

## Acceptance Criteria

- A top-level `xs:simpleType` with restriction facets is stored in `schema.types` under its `name`.
- An element referencing that simpleType via `type="TypeName"` has the facets resolved onto it before validation.
- Inline `xs:simpleType` inside `xs:element` (already working via `ParseRestrictionsStep`) continues to work.
- A new integration test in `parser.test.ts` or `validator.test.ts` covers this scenario end-to-end.

## Implementation Hints

1. In `extractTopLevelSchemaNodes`, add `el.localName === "simpleType"` to the filter condition.
2. In `XSDPipelineParserImpl.parse()`, extract `simpleTypeNodes` alongside `elementNodes` and `complexTypeNodes`, process them through the pipeline, and merge their results into `typesMap` (same key = `name` attribute).
3. `ParseRestrictionsStep` already parses restriction facets for inline simpleTypes — the same pipeline reused on top-level simpleType nodes should work without changes, but verify the element passed in has `name` at the top level (it will be on the `xs:simpleType` element itself, not a child).
4. The `ModularTypeReferenceResolver` already looks up `schema.types` — no resolver changes needed once the types are stored.
