import { NodeValidationStep, ValidationError } from "@lib/types/validation.js";

/**
 * Enforces xs:complexType mixed content rules.
 *
 * When mixed is false (the default), an element must not contain non-whitespace
 * text nodes alongside child elements. When mixed is true, interleaved text is allowed.
 */
export const validateMixedContent: NodeValidationStep = (node, schema) => {
  if (schema.mixed === true) {
    return [];
  }

  const hasElementChildren = Array.from(node.childNodes).some((n) => n.nodeType === 1);
  if (!hasElementChildren) {
    return [];
  }

  const hasTextContent = Array.from(node.childNodes).some(
    (n) => n.nodeType === 3 && /\S/.test(n.nodeValue ?? ""),
  );

  if (!hasTextContent) {
    return [];
  }

  const errors: ValidationError[] = [
    {
      code: "TYPE_MISMATCH",
      message: `Element <${schema.name}> contains mixed text and element content but mixed="true" is not declared.`,
      element: schema.name,
      expected: "element-only content",
      actual: "mixed text and element content",
    },
  ];
  return errors;
};
