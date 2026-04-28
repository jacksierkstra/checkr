# fix-all-order-independence: xs:all children incorrectly enforce sequence order

| Field    | Value    |
|----------|----------|
| Type     | bug      |
| Priority | medium   |
| Status   | done     |

## Problem

`ParseNestedElementsStep` encounters `xs:all` containers and flattens their children into the same `children` array as `xs:sequence` children (see the `else if (this.isXsdElement(child, "all"))` branch). The same happens in `ParseExtensionStep`.

Because `validateSequenceOrder` operates on `schema.children` without distinguishing between sequence and all-group children, it enforces ordering on what should be order-independent children. A valid document whose `xs:all` elements appear in a different order than the schema declaration will receive a `SEQUENCE_VIOLATION` error it should not receive.

ADR-009 defers full `xs:all` semantics, but the current behaviour is **actively wrong** — it produces false positives for order. The minimum fix is to ensure `xs:all` children do not participate in sequence-order enforcement, even if full order-independence validation (e.g., each must appear exactly once) is not implemented.

## Acceptance Criteria

- Child elements of an `xs:all` group may appear in any order in the XML document without triggering `SEQUENCE_VIOLATION`.
- The `minOccurs`/`maxOccurs` constraints on individual `xs:all` children are still enforced.
- Existing `xs:sequence` tests are unaffected.
- Co-located tests cover: `xs:all` children in schema order (should pass), `xs:all` children in reverse order (should pass), missing required `xs:all` child (should fail with `MISSING_REQUIRED_ELEMENT`).

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Add an `inAll?: boolean` flag to `XSDElement`, or introduce a dedicated `allChildren?: XSDElement[]` array analogous to `choices`.
2. **Parsing:** In `ParseNestedElementsStep.parseContainer`, when processing an `xs:all` container, tag each child with `inAll: true` (or push them into `allChildren`) instead of `children`.
3. **Validation (`validateSequenceOrder`):** Skip elements where `schema.children[i].inAll === true` (or use `allChildren` list) when building the `schemaIndexMap`.
4. Alternatively, store `all` children completely separately from `sequence` children so `validateSequenceOrder` never sees them.
