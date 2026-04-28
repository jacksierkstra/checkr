import { NodeValidationStep, ValidationError } from "@lib/types/validation";

const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

export const validateElementFixed: NodeValidationStep = (node, schema) => {
  if (schema.fixed === undefined) return [];

  const isNil =
    node.getAttributeNS(XSI_NAMESPACE, "nil") === "true" || node.getAttribute("xsi:nil") === "true";
  if (isNil) return [];

  const text = node.textContent ?? "";
  if (text !== schema.fixed) {
    return [
      {
        code: "TYPE_MISMATCH",
        message: `Element <${schema.name}> must have fixed value "${schema.fixed}", but found "${text}".`,
        element: schema.name,
        expected: schema.fixed,
        actual: text,
      },
    ];
  }
  return [];
};
