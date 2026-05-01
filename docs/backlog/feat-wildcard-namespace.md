# feat-wildcard-namespace: xs:any and xs:anyAttribute namespace attribute

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | backlog |

## Problem

`xs:any` and `xs:anyAttribute` accept a `namespace` attribute that restricts which namespaces the wildcard matches:

- `##any` (default) — matches any namespace.
- `##other` — matches any namespace other than the target namespace.
- `##local` — matches elements/attributes with no namespace.
- `##targetNamespace` — matches elements/attributes in the target namespace.
- A space-separated list of URIs — matches only those namespaces.

Currently this attribute is not parsed or enforced. All wildcard content matches any namespace.

## Acceptance Criteria

- `namespace="##local"` allows only unqualified (no-namespace) elements/attributes.
- `namespace="##other"` allows only elements/attributes outside the schema's target namespace.
- `namespace="http://example.com"` allows only elements/attributes in the given namespace.
- `namespace="##any"` (default) retains current behaviour.
- Existing tests continue to pass.

## Implementation Hints

1. **Type change:** Add `anyNamespace?: string` to `XSDElement` in `src/lib/types/xsd.ts`.
2. **Parse steps:** Extract `namespace=` attribute from `<xs:any>` (in `nestedElement.ts`) and from `<xs:anyAttribute>` (in `attributes.ts`).
3. **Validation:** In `unexpectedElements.ts` and `attributes.ts`, when processing wildcard content, evaluate the element's/attribute's namespace URI against `anyNamespace` using the matching rules above.
4. Requires access to `schema.targetNamespace` to evaluate `##other` and `##targetNamespace`.
