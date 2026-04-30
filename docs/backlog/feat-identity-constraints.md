# feat-identity-constraints: xs:key, xs:unique, xs:keyref

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | done |

## Problem

XSD 1.0 provides three identity constraint declarations that can appear inside `xs:element`:

- **`xs:unique`** — selected values must be unique within the element's scope.
- **`xs:key`** — like `xs:unique`, but additionally the value must be present (not nil/absent).
- **`xs:keyref`** — each selected value must match a value declared by a corresponding `xs:key` or `xs:unique`.

Each constraint has a `xs:selector` child (an XPath subset selecting a set of nodes) and one or more `xs:field` children (XPath subsets selecting the value(s) to compare).

Currently these declarations are completely ignored. Documents that violate key or uniqueness constraints are silently accepted as valid.

## Acceptance Criteria

- `xs:unique`: duplicate field values within the selector scope produce a validation error with code `UNIQUENESS_VIOLATION` (new code to add).
- `xs:key`: same as `xs:unique`, plus absence of the selected node produces a `MISSING_REQUIRED_ELEMENT` error.
- `xs:keyref`: a field value that does not match any value in the referenced `xs:key`/`xs:unique` produces a `REFERENCE_VIOLATION` (new code to add).
- Constraints are scoped correctly: each `xs:unique`/`xs:key` is evaluated relative to the element it is declared on.
- The XPath subset supported for `xs:selector` and `xs:field` covers at minimum: `.`, `child::name`, `@attr`, `name/@attr`, and simple `/`-joined paths.
- Co-located tests cover: unique violation; key violation (missing + duplicate); keyref pointing to missing key; valid document passes all constraints.

## Implementation Hints

1. **Types (`src/lib/types/xsd.ts`):** Add `identityConstraints?: XSDIdentityConstraint[]` to `XSDElement`. Define:
   ```ts
   interface XSDIdentityConstraint {
     kind: "key" | "unique" | "keyref";
     name: string;
     refer?: string;           // only for keyref
     selector: string;         // XPath subset string
     fields: string[];         // XPath subset strings
   }
   ```
2. **`ValidationErrorCode`:** Add `"UNIQUENESS_VIOLATION"` and `"REFERENCE_VIOLATION"` to the union.
3. **XSD parsing:** Add a new `ParseIdentityConstraintsStep` that reads `xs:key`, `xs:unique`, and `xs:keyref` children of an element declaration and populates `identityConstraints`.
4. **Validation:** Add a new document-level validation function `validateIdentityConstraints(xmlDoc, schema)` that walks the schema tree, and for each element with `identityConstraints`, evaluates selector/field XPath expressions using the native DOM `evaluate()` API (available in both browser and Node 18+).
5. **XPath evaluation:** Use `document.evaluate()` with `XPathResult.ORDERED_NODE_ITERATOR_TYPE`. Scope the selector to the matching XML element node. The XPath subset is small enough that native evaluation handles it without a custom parser.
6. **keyref resolution:** Collect all key/unique constraint results first (keyed by constraint name), then evaluate keyref constraints against the collected sets.
