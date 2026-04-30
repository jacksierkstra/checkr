import { NodeValidationStep, ValidationError } from "@lib/types/validation";
import { directChildElements, matchesSchemaElement } from "@lib/validator/utils/schemaMatch";

/**
 * Validates that child elements of an XML node are all declared in the schema.
 * Only active when schema.children or schema.choices is non-empty (closed content model).
 */
export const validateUnexpectedElements: NodeValidationStep = (node, schema) => {
  const hasChildren = schema.children && schema.children.length > 0;
  const hasChoices = schema.choices && schema.choices.length > 0;

  if (!hasChildren && !hasChoices) return [];

  // xs:any wildcard — all child elements are permitted
  if (schema.allowAnyChild) return [];

  const errors: ValidationError[] = [];

  directChildElements(node).forEach((childEl) => {
    const childName = (childEl.localName || childEl.tagName || "").toLowerCase();
    const blocked = [
      ...(schema.children ?? []),
      ...((schema.choices ?? []).flatMap((choice) => choice.elements)),
    ].some((declaredChild) =>
      (declaredChild.blockedSubstitutes ?? []).some((s) => s.toLowerCase() === childName),
    );
    const declared =
      (schema.children ?? []).some(
        (declaredChild) =>
          matchesSchemaElement(childEl, declaredChild) ||
          (declaredChild.allowedSubstitutes ?? []).some((s) => s.toLowerCase() === childName),
      ) ||
      (schema.choices ?? []).some((choice) =>
        choice.elements.some(
          (declaredChild) =>
            matchesSchemaElement(childEl, declaredChild) ||
            (declaredChild.allowedSubstitutes ?? []).some((s) => s.toLowerCase() === childName),
        ),
      );
    if (blocked) {
      errors.push({
        code: "DERIVATION_BLOCKED",
        message: `Element <${childName}> is blocked from substituting its head element in <${schema.name}>.`,
        element: childName,
      });
      return;
    }
    if (childName && !declared) {
      errors.push({
        code: "UNEXPECTED_ELEMENT",
        message: `Element <${childName}> is not declared in the schema for <${schema.name}>.`,
        element: childName,
      });
    }
  });

  return errors;
};
