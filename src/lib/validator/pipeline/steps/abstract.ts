import { NodeValidationStep } from "@lib/types/validation.js";

export const validateAbstract: NodeValidationStep = (node, schema) => {
  if (schema.abstract === true) {
    return [
      {
        code: "ABSTRACT_ELEMENT",
        message: `Element <${schema.name}> is abstract and cannot be used directly in an instance document.`,
        element: schema.name,
      },
    ];
  }
  return [];
};
