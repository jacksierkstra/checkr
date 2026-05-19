import { GlobalValidationStep, ValidationError } from "@lib/types/validation.js";

export const validateOccurrence: GlobalValidationStep = (nodes, schema) => {
  const errors: ValidationError[] = [];
  const count = nodes.length;

  if (schema.minOccurs !== undefined && count < schema.minOccurs) {
    errors.push({
      code: "OCCURRENCE_VIOLATION",
      message: `Element ${schema.name} occurs ${count} times, but should occur at least ${schema.minOccurs} times.`,
      element: schema.name,
    });
  }

  if (
    schema.maxOccurs !== undefined &&
    schema.maxOccurs !== "unbounded" &&
    count > schema.maxOccurs
  ) {
    errors.push({
      code: "OCCURRENCE_VIOLATION",
      message: `Element ${schema.name} occurs ${count} times, but should occur at most ${schema.maxOccurs} times.`,
      element: schema.name,
    });
  }

  return errors;
};
