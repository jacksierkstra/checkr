# feat-xsi-type: `xsi:type` runtime type substitution

| Field    | Value   |
|----------|---------|
| Type     | feature |
| Priority | high    |
| Status   | backlog |

## Problem

XSD 1.0 §2.6.1 defines the `xsi:type` attribute (namespace `http://www.w3.org/2001/XMLSchema-instance`). When present on an XML element, it overrides the type declared in the schema for that element with the named type, provided the named type is a valid derivation of the declared type (or equal to it).

Example:

```xml
<!-- Schema -->
<xs:element name="shape" type="ShapeType"/>
<xs:complexType name="ShapeType" abstract="true">…</xs:complexType>
<xs:complexType name="CircleType">
  <xs:complexContent>
    <xs:extension base="ShapeType">
      <xs:element name="radius" type="xs:decimal"/>
    </xs:extension>
  </xs:complexContent>
</xs:complexType>

<!-- XML — valid because xsi:type names a derived type -->
<shape xsi:type="CircleType" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <radius>5.0</radius>
</shape>
```

Checkr currently ignores `xsi:type` entirely, meaning:
- Instances that rely on `xsi:type` to satisfy an abstract base type pass incorrectly or fail to validate the substituted type's constraints.
- Instances that use `xsi:type` with an invalid/non-derived type are silently accepted.

## Acceptance Criteria

- When an XML element carries `xsi:type="T"`, the validator resolves `T` from `schema.types`, looks up the named type, and validates the element's content against that resolved type instead of the declared schema type.
- `xsi:type` value must be a QName resolvable to a type in the schema. If unresolvable, emit a `TYPE_MISMATCH` error.
- If the declared schema type has `block="restriction"` or `block="extension"` set, and the `xsi:type` value would require that derivation kind, emit a `DERIVATION_BLOCKED` error (reuse existing code in `derivationBlocked.ts`).
- `xsi:type` with a type that is neither the declared type nor a derivation of it should be treated as a `TYPE_MISMATCH` (or a `DERIVATION_BLOCKED` if blocked). Full derivation-chain checking is required.
- `xsi:type="xs:string"` and other built-in types must be accepted for elements whose declared type is `xs:anyType` or `xs:anySimpleType`.
- The `xsi` namespace prefix must be recognised by its URI (`http://www.w3.org/2001/XMLSchema-instance`), not hard-coded as `xsi:`.
- All existing tests continue to pass.

## Implementation Hints

1. **Where to intercept**: In `ValidatorImpl.validateNode()` (or a new `NodeValidationStep`), check whether the current `node` element has an attribute in namespace `http://www.w3.org/2001/XMLSchema-instance` with local name `type`.
2. **Resolve the type**: Strip the namespace prefix (if any) from the `xsi:type` value and look it up in `schema.types`. If not found, try `schema.elements` (for element-typed references). Emit `TYPE_MISMATCH` if unresolvable.
3. **Derivation check**: Walk the resolved type's inheritance chain (via `extension.base` / `restriction.base`) to confirm it derives from the element's declared type. The `ModularTypeReferenceResolver` already traverses these chains — reuse that logic.
4. **Substitute the schema**: Replace the `schemaElement` passed into `nodePipeline.execute()` with the resolved `xsi:type` schema for the node-level validation pass. Do not alter the global pipeline (occurrence counts stay on the declared element name).
5. **`block` enforcement**: After resolving the xsi:type chain, if the declared type has `block` containing the derivation kind used, call `validateDerivationBlocked` with an appropriate synthesised schema.
6. **New validation step (preferred)**: Implement `validateXsiType: NodeValidationStep` in `src/lib/validator/pipeline/steps/xsiType.ts`. The step receives `(node, schema)` and returns errors if the `xsi:type` value is invalid; it does NOT redirect the pipeline (that must happen in `ValidatorImpl`). The type-redirect logic belongs in `ValidatorImpl.validateNode()` before the pipeline is called.
