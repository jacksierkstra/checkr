import { NodeValidationStep, ValidationError } from "@lib/types/validation";

/**
 * Checks pattern, minLength, maxLength for element text content.
 * Per XSD 1.0 §4.3.4, xs:pattern applies to ALL simple types (not just strings).
 */
export const validateConstraints: NodeValidationStep = (node, schema) => {
  const errors: ValidationError[] = [];

  // If there's no pattern/minLength/maxLength, no checks needed
  if (!schema.pattern && schema.minLength == null && schema.maxLength == null) {
    return errors;
  }

  const text = node.textContent?.trim() || "";

  // Pattern check — applies to any simple type, matched against lexical value
  if (schema.pattern) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(text)) {
      errors.push({
        code: "PATTERN_MISMATCH",
        message: `Element <${schema.name}> does not match the pattern /${schema.pattern}/, found "${text}".`,
        element: schema.name,
      });
    }
  }

  // minLength
  if (schema.minLength != null && text.length < schema.minLength) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must be at least length ${schema.minLength}, found length ${text.length}.`,
      element: schema.name,
    });
  }

  // maxLength
  if (schema.maxLength != null && text.length > schema.maxLength) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must be at most length ${schema.maxLength}, found length ${text.length}.`,
      element: schema.name,
    });
  }

  return errors;
};
