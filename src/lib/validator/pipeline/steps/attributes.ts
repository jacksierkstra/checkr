import { NodeValidationStep, ValidationError } from "@lib/types/validation";
import { XSDAttribute } from "@lib/types/xsd";

const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

/**
 * Validates an attribute value against a given XSD type.
 * Returns an error message string or null if valid.
 */
function validateAttrType(
  attrName: string,
  elementName: string,
  value: string,
  type: string | undefined,
): ValidationError | null {
  if (!type || !value.trim()) return null;

  switch (type) {
    case "xs:string":
      return null; // any value is valid
    case "xs:integer":
      if (!/^-?\d+$/.test(value)) {
        return {
          code: "ATTRIBUTE_INVALID",
          message: `Attribute '${attrName}' in element <${elementName}> must be an integer, but found '${value}'.`,
          element: elementName,
        };
      }
      return null;
    case "xs:decimal":
    case "xs:float":
    case "xs:double":
      if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
        return {
          code: "ATTRIBUTE_INVALID",
          message: `Attribute '${attrName}' in element <${elementName}> must be a decimal number, but found '${value}'.`,
          element: elementName,
        };
      }
      return null;
    case "xs:boolean":
      if (!["true", "false", "1", "0"].includes(value)) {
        return {
          code: "ATTRIBUTE_INVALID",
          message: `Attribute '${attrName}' in element <${elementName}> must be a boolean (true/false/1/0), but found '${value}'.`,
          element: elementName,
        };
      }
      return null;
    case "xs:date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return {
          code: "ATTRIBUTE_INVALID",
          message: `Attribute '${attrName}' in element <${elementName}> must be a valid date (YYYY-MM-DD), but found '${value}'.`,
          element: elementName,
        };
      }
      return null;
    default:
      return null; // unknown type — skip
  }
}

export const validateAttributes: NodeValidationStep = (node, schema) => {
  if (!schema.attributes || schema.attributes.length === 0) return [];

  const errors: ValidationError[] = schema.attributes.flatMap((attr: XSDAttribute) => {
    // Handle both namespaced and non-namespaced attributes
    const value = attr.namespace
      ? node.getAttributeNS(attr.namespace, attr.name)
      : node.getAttribute(attr.name);
    const attrErrors: ValidationError[] = [];

    // Apply default value for absent optional attributes
    const effectiveValue =
      value === null && attr.use !== "required" && attr.default !== undefined
        ? attr.default
        : value;

    // Required attribute check (treat empty string as missing)
    if (attr.use === "required" && (!value || value.trim() === "")) {
      attrErrors.push({
        code: "ATTRIBUTE_MISSING",
        message: `Missing required attribute '${attr.name}' in element <${schema.name}>.`,
        element: schema.name,
      });
    }

    // Fixed value enforcement
    if (attr.fixed !== undefined && effectiveValue !== null && effectiveValue !== attr.fixed) {
      attrErrors.push({
        code: "ATTRIBUTE_INVALID",
        message: `Attribute '${attr.name}' in element <${schema.name}> must be fixed to '${attr.fixed}', but found '${effectiveValue}'.`,
        element: schema.name,
      });
    }

    // Type validation for present, non-empty values
    if (effectiveValue !== null && effectiveValue.trim() !== "") {
      const typeError = validateAttrType(attr.name, schema.name, effectiveValue, attr.type);
      if (typeError) attrErrors.push(typeError);
    }

    return attrErrors;
  });

  // Check for unexpected attributes (attributes in XML not declared in schema)
  const declaredNames = new Set(schema.attributes.map((a) => a.name.toLowerCase()));
  Array.from(node.attributes).forEach((attr) => {
    // Allow xmlns namespace declarations and xsi:* attributes
    if (attr.namespaceURI === XMLNS_NAMESPACE) return;
    if (attr.namespaceURI === XSI_NAMESPACE) return;
    if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) return;

    const attrLocalName = attr.localName || attr.name;
    if (!declaredNames.has(attrLocalName.toLowerCase())) {
      errors.push({
        code: "ATTRIBUTE_INVALID",
        message: `Attribute '${attrLocalName}' in element <${schema.name}> is not declared in the schema.`,
        element: schema.name,
      });
    }
  });

  return errors;
};
