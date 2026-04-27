import { NodeValidationStep, ValidationError } from "@lib/types/validation";
import { XSDElement } from "@lib/types/xsd";

/**
 * Type validation step to enforce XSD-defined types and constraints.
 */
export const validateType: NodeValidationStep = (node, schema) => {
  const errors: ValidationError[] = [];
  const text = node.textContent?.trim() || "";

  // Skip validation if no type is specified
  if (!schema.type) return errors;

  // Handle enumeration validation
  if (schema.enumeration && schema.enumeration.length > 0) {
    if (!schema.enumeration.includes(text)) {
      errors.push({
        code: "TYPE_MISMATCH",
        message: `Element <${schema.name}> must be one of [${schema.enumeration.join(", ")}], but found "${text}".`,
        element: schema.name,
      });
    }
  }

  // Handle pattern validation
  if (schema.pattern) {
    try {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(text)) {
        errors.push({
          code: "PATTERN_MISMATCH",
          message: `Element <${schema.name}> must match pattern "${schema.pattern}", but found "${text}".`,
          element: schema.name,
        });
      }
    } catch {
      errors.push({
        code: "PATTERN_MISMATCH",
        message: `Element <${schema.name}> has an invalid pattern "${schema.pattern}" in the schema definition.`,
        element: schema.name,
      });
    }
  }

  // Handle length constraints
  if (schema.minLength !== undefined && text.length < schema.minLength) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must have a minimum length of ${schema.minLength}, but found length ${text.length}.`,
      element: schema.name,
    });
  }

  if (schema.maxLength !== undefined && text.length > schema.maxLength) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must have a maximum length of ${schema.maxLength}, but found length ${text.length}.`,
      element: schema.name,
    });
  }

  // Basic type validation based on schema type
  switch (schema.type) {
    case "xs:string":
      break; // Strings accept any value
    case "xs:integer":
      if (!/^-?\d+$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be an integer, but found "${text}".`,
          element: schema.name,
        });
      } else {
        // Additional numeric validations if this is an integer
        validateNumericConstraints(parseInt(text, 10), schema, errors);
      }
      break;
    case "xs:decimal":
    case "xs:float":
    case "xs:double":
      if (!/^-?\d+(\.\d+)?$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a decimal number, but found "${text}".`,
          element: schema.name,
        });
      } else {
        // Additional numeric validations if this is a number
        validateNumericConstraints(parseFloat(text), schema, errors);
      }
      break;
    case "xs:boolean":
      if (!["true", "false", "1", "0"].includes(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a boolean (true/false/1/0), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid date (YYYY-MM-DD), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    default:
      // For non-built-in types, we rely on type resolution to have already happened
      break;
  }

  return errors;
};

/**
 * Helper function to validate numeric constraints like minInclusive, maxInclusive, etc.
 */
function validateNumericConstraints(
  value: number,
  schema: XSDElement,
  errors: ValidationError[],
): void {
  // These constraints would be available if a restriction is resolved onto the schema
  if (schema.minInclusive !== undefined && value < schema.minInclusive) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must have a value greater than or equal to ${schema.minInclusive}, but found ${value}.`,
      element: schema.name,
    });
  }

  if (schema.maxInclusive !== undefined && value > schema.maxInclusive) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must have a value less than or equal to ${schema.maxInclusive}, but found ${value}.`,
      element: schema.name,
    });
  }

  if (schema.minExclusive !== undefined && value <= schema.minExclusive) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must have a value greater than ${schema.minExclusive}, but found ${value}.`,
      element: schema.name,
    });
  }

  if (schema.maxExclusive !== undefined && value >= schema.maxExclusive) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must have a value less than ${schema.maxExclusive}, but found ${value}.`,
      element: schema.name,
    });
  }
}
