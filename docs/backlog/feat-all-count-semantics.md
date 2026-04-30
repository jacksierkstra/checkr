# feat-all-count-semantics: xs:all full count enforcement

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

`xs:all` declares that its child elements may appear in any order, each at most once. Checkr already parses `xs:all` children with `inAll: true` and exempts them from sequence-order enforcement. However, the count semantics are not enforced:

1. Each child of `xs:all` must appear **at most once** in the XML instance (unless `minOccurs="0"`, in which case it may be absent).
2. `maxOccurs` on a child of `xs:all` is restricted to `0` or `1` by the XSD 1.0 spec — values greater than `1` are schema errors and should be treated as `1`.
3. `xs:all` itself may only appear as a direct child of `xs:complexType` (not nested inside `xs:sequence` or `xs:choice`).

Currently, if an `xs:all` child element appears more than once in the XML, no `OCCURRENCE_VIOLATION` is raised.

## Acceptance Criteria

- A child of `xs:all` that appears **more than once** in its parent XML element produces an `OCCURRENCE_VIOLATION` error.
- A child of `xs:all` with `minOccurs="1"` (the default) that is **absent** from the XML still produces a `MISSING_REQUIRED_ELEMENT` error (this is already partially handled by `validateRequiredChildren`, but must be confirmed to work correctly with `inAll: true`).
- A child of `xs:all` with `minOccurs="0"` that is absent produces no error.
- `maxOccurs` values greater than `1` on `xs:all` children are clamped to `1` at parse time (or at validation time) without crashing.
- Co-located tests cover: all-child appears twice (error); all-child absent with minOccurs=1 (error); all-child absent with minOccurs=0 (ok); all children present in reverse order (ok).

## Implementation Hints

1. **Validation step:** Add a new `GlobalValidationStep` (or extend the existing occurrence step) specifically for `inAll: true` children. For each `xs:all` child schema, count how many times a matching XML element appears and error if the count exceeds `maxOccurs` (treated as 1).
2. **Parse-time clamping:** In `ParseNestedElementsStep`, when an element is inside `xs:all`, cap `maxOccurs` at `1`.
3. **Interaction with existing occurrence step:** The existing `validateOccurrence` step uses per-parent counting introduced by `fix-occurrence-per-parent`. Verify it does not double-count with the new xs:all step, or gate one step on `inAll`.
