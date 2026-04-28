# feat-attribute-defaults: Apply default attribute values during validation

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | medium  |
| Status   | done |

## Problem

`XSDAttribute.default` is parsed by `ParseAttributesStep` but never used during validation. When an optional attribute is absent from the XML, the schema's declared default value should be treated as if it were present for constraint-checking purposes.

This matters when a default value combined with `fixed` or type constraints must be enforced consistently.

## Acceptance Criteria

- When an optional attribute is absent and the schema declares a `default` value, validation behaves as if the attribute were present with that value.
- A `fixed` attribute with a default equal to the fixed value passes.
- A `fixed` attribute with a default differing from the fixed value is a schema error — skip enforcement (schema is malformed) or emit a clear error.
- The actual XML document is not mutated — defaults are applied only logically during validation.
- Existing attribute tests continue to pass.

## Implementation Hints

1. In `validateAttributes`, when `value` is `null` (attribute absent), check for `attr.default`. If present, use `attr.default` as the effective value for subsequent checks.
2. Required attributes (`attr.use === "required"`) should still fail when absent — the default-substitution logic only applies to optional attributes.
3. No changes to parsing or type definitions are needed; `XSDAttribute.default` already exists.
