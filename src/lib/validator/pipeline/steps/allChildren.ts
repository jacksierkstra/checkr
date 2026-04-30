import { NodeValidationStep, ValidationError } from "@lib/types/validation";
import { directChildElements, matchesSchemaElement } from "@lib/validator/utils/schemaMatch";

/**
 * Enforces full xs:all semantics on a parent element.
 *
 * XSD 1.0 xs:all requires that each declared child appears at most once,
 * regardless of any declared maxOccurs value (which must be 0 or 1 per spec).
 *
 * validateOccurrence already enforces maxOccurs for the standard case
 * (maxOccurs=1, the default). This step covers the additional case where
 * maxOccurs > 1 or "unbounded" has been (invalidly) declared on an xs:all child,
 * ensuring the at-most-once invariant is always upheld for xs:all members.
 */
export const validateAllChildren: NodeValidationStep = (node, schema) => {
  if (!schema.children) return [];

  const allChildren = schema.children.filter((c) => c.inAll === true);
  if (allChildren.length === 0) return [];

  const xmlChildren = directChildElements(node);

  const errors: ValidationError[] = [];

  for (const childSchema of allChildren) {
    const count = xmlChildren.filter((el) => matchesSchemaElement(el, childSchema)).length;

    if (count > 1) {
      errors.push({
        code: "OCCURRENCE_VIOLATION",
        message: `Element <${childSchema.name}> is a member of xs:all and must appear at most once inside <${schema.name}>, but appears ${count} times.`,
        element: childSchema.name,
        expected: 1,
        actual: count,
      });
    }
  }

  return errors;
};
