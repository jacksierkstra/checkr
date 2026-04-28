import { NodeValidationStep, ValidationError } from "@lib/types/validation";
import { XSDAttribute } from "@lib/types/xsd";

const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

export const validateAttributes: NodeValidationStep = (node, schema) => {
  if (!schema.attributes || schema.attributes.length === 0) return [];

  const errors: ValidationError[] = schema.attributes.flatMap((attr: XSDAttribute) => {
    // Handle both namespaced and non-namespaced attributes
    const value = attr.namespace
      ? node.getAttributeNS(attr.namespace, attr.name)
      : node.getAttribute(attr.name);
    const attrErrors: ValidationError[] = [];

    // Required attribute check (treat empty string as missing)
    if (attr.use === "required" && (!value || value.trim() === "")) {
      attrErrors.push({
        code: "ATTRIBUTE_MISSING",
        message: `Missing required attribute '${attr.name}' in element <${schema.name}>.`,
        element: schema.name,
      });
    }

    // Fixed value enforcement
    if (attr.fixed !== undefined && value !== null && value !== attr.fixed) {
      attrErrors.push({
        code: "ATTRIBUTE_INVALID",
        message: `Attribute '${attr.name}' in element <${schema.name}> must be fixed to '${attr.fixed}', but found '${value}'.`,
        element: schema.name,
      });
    }

    // Basic type validation
    if (value !== null && value.trim() !== "") {
      if (attr.type === "xs:integer" && !/^-?\d+$/.test(value)) {
        attrErrors.push({
          code: "ATTRIBUTE_INVALID",
          message: `Attribute '${attr.name}' in element <${schema.name}> must be an integer, but found '${value}'.`,
          element: schema.name,
        });
      }
      if (attr.type === "xs:boolean" && !["true", "false", "1", "0"].includes(value)) {
        attrErrors.push({
          code: "ATTRIBUTE_INVALID",
          message: `Attribute '${attr.name}' in element <${schema.name}> must be a boolean (true/false/1/0), but found '${value}'.`,
          element: schema.name,
        });
      }
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
