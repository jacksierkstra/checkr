import { NodeValidationStep, ValidationError } from "@lib/types/validation";

/**
 * Validates that child elements of an XML node are all declared in the schema.
 * Only active when schema.children or schema.choices is non-empty (closed content model).
 */
export const validateUnexpectedElements: NodeValidationStep = (node, schema) => {
  const hasChildren = schema.children && schema.children.length > 0;
  const hasChoices = schema.choices && schema.choices.length > 0;

  if (!hasChildren && !hasChoices) return [];

  const declaredNames = new Set<string>();
  if (schema.children) {
    schema.children.forEach((c) => declaredNames.add(c.name.toLowerCase()));
  }
  if (schema.choices) {
    schema.choices.forEach((choice) => {
      choice.elements.forEach((el) => declaredNames.add(el.name.toLowerCase()));
    });
  }

  const errors: ValidationError[] = [];

  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType !== 1) return; // skip non-elements
    const childEl = child as Element;
    const childName = (childEl.localName || childEl.tagName || "").toLowerCase();
    if (childName && !declaredNames.has(childName)) {
      errors.push({
        code: "UNEXPECTED_ELEMENT",
        message: `Element <${childName}> is not declared in the schema for <${schema.name}>.`,
        element: childName,
      });
    }
  });

  return errors;
};
