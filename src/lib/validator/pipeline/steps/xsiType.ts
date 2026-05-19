import { ValidationError } from "@lib/types/validation.js";
import { XSDElement, XSDSchema } from "@lib/types/xsd.js";

const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

/** Strips the namespace prefix from a QName, returning the local name. */
function stripPrefix(qname: string): string {
  const colon = qname.indexOf(":");
  return colon >= 0 ? qname.slice(colon + 1) : qname;
}

/**
 * Returns the xsi:type attribute value from a node if present, or null.
 * Recognises the attribute by namespace URI so any prefix is supported.
 */
export function getXsiTypeValue(node: Element): string | null {
  return node.getAttributeNS(XSI_NAMESPACE, "type") ?? node.getAttribute("xsi:type");
}

/**
 * Returns true if `candidateName` is the same as or is derived from `baseTypeName`
 * by walking extension/restriction chains in the raw schema types map.
 */
function isDerivedFrom(
  candidateName: string,
  baseTypeName: string,
  schemaTypes: Record<string, XSDElement>,
): boolean {
  if (candidateName === baseTypeName) return true;

  const visited = new Set<string>();
  let current: XSDElement | undefined = schemaTypes[candidateName];

  while (current) {
    if (visited.has(current.name)) break;
    visited.add(current.name);

    const parentBase = current.extension?.base ?? current.restriction?.base;
    if (!parentBase) break;

    const parentName = stripPrefix(parentBase);
    if (parentName === baseTypeName) return true;

    current = schemaTypes[parentName];
  }

  return false;
}

/**
 * The result of resolving an xsi:type attribute:
 * - `{ resolved }` — substitution is valid; use this raw type definition (caller must fully resolve it)
 * - `{ errors }` — xsi:type is invalid; propagate these errors
 * - `null` — no xsi:type attribute is present; proceed with the declared schema unchanged
 */
export type XsiTypeResolution = { resolved: XSDElement } | { errors: ValidationError[] } | null;

/**
 * Resolves and validates the xsi:type attribute on an XML node.
 *
 * Checks performed:
 * - Unresolvable type name → TYPE_MISMATCH
 * - Derivation blocked by declared element's `block` attribute → DERIVATION_BLOCKED
 * - Candidate type does not derive from declared type → TYPE_MISMATCH
 * - xs: built-in types are accepted as-is (no further checks needed)
 */
export function resolveXsiType(
  node: Element,
  declaredSchema: XSDElement,
  schema: XSDSchema,
): XsiTypeResolution {
  const xsiTypeValue = getXsiTypeValue(node);
  if (!xsiTypeValue) return null;

  const prefix = xsiTypeValue.includes(":") ? xsiTypeValue.split(":")[0] : null;
  const localName = stripPrefix(xsiTypeValue);
  const isBuiltIn = prefix === "xs" || prefix === "xsd";

  const schemaTypes = schema.types ?? {};
  const candidateType = schemaTypes[localName];

  if (!candidateType) {
    if (isBuiltIn) {
      // Built-in types (xs:string, xs:integer, …) have no entry in schema.types.
      // Accept for anyType/anySimpleType elements; normal type validation will run unchanged.
      return null;
    }
    return {
      errors: [
        {
          code: "TYPE_MISMATCH",
          message: `xsi:type value "${xsiTypeValue}" cannot be resolved to a type in the schema.`,
          element: declaredSchema.name,
          expected: "a known type",
          actual: xsiTypeValue,
        },
      ],
    };
  }

  // Determine the derivation kind the candidate introduces (extension or restriction).
  const derivationKind: "extension" | "restriction" | undefined =
    candidateType.extension !== undefined
      ? "extension"
      : candidateType.restriction !== undefined
        ? "restriction"
        : undefined;

  // Check block constraint on the declared element.
  if (derivationKind && declaredSchema.block) {
    const blocked = declaredSchema.block.split(/\s+/);
    if (blocked.includes(derivationKind) || blocked.includes("#all")) {
      return {
        errors: [
          {
            code: "DERIVATION_BLOCKED",
            message: `xsi:type "${xsiTypeValue}" uses ${derivationKind} which is blocked on element <${declaredSchema.name}>.`,
            element: declaredSchema.name,
            expected: `not blocked`,
            actual: derivationKind,
          },
        ],
      };
    }
  }

  // Derive the declared base type name from the declared schema's `type` field.
  const declaredTypeName = declaredSchema.type ? stripPrefix(declaredSchema.type) : null;

  // If a user-defined declared type exists, the candidate must derive from it.
  // Skip this check for xs: built-in base types and unset types (treated as anyType).
  if (declaredTypeName) {
    const baseIsBuiltIn = declaredSchema.type
      ? declaredSchema.type.startsWith("xs:") || declaredSchema.type.startsWith("xsd:")
      : false;

    if (!baseIsBuiltIn && declaredTypeName !== "anyType" && declaredTypeName !== "anySimpleType") {
      if (!isDerivedFrom(localName, declaredTypeName, schemaTypes)) {
        return {
          errors: [
            {
              code: "TYPE_MISMATCH",
              message: `xsi:type "${xsiTypeValue}" is not derived from declared type "${declaredTypeName}" on element <${declaredSchema.name}>.`,
              element: declaredSchema.name,
              expected: declaredTypeName,
              actual: xsiTypeValue,
            },
          ],
        };
      }
    }
  }

  // Valid substitution — return the raw candidate type with the declared element name
  // so that element matching in child validators remains correct.
  return { resolved: { ...candidateType, name: declaredSchema.name } };
}
