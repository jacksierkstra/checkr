import { NodeValidationStep, ValidationError } from "@lib/types/validation";
import { XSDElement } from "@lib/types/xsd";

const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

function normalizeWhiteSpace(raw: string, mode: "preserve" | "replace" | "collapse"): string {
  switch (mode) {
    case "preserve":
      return raw;
    case "replace":
      return raw.replace(/[\t\n\r]/g, " ");
    case "collapse":
      return raw.replace(/[\t\n\r]/g, " ").replace(/\s+/g, " ").trim();
  }
}

/**
 * Type validation step to enforce XSD-defined types and constraints.
 */
export const validateType: NodeValidationStep = (node, schema) => {
  const errors: ValidationError[] = [];
  const rawText = node.textContent ?? "";
  const whiteSpaceMode = schema.whiteSpace ?? schema.restriction?.whiteSpace;
  const text = whiteSpaceMode ? normalizeWhiteSpace(rawText, whiteSpaceMode) : rawText.trim();

  // Handle xsi:nil — nil elements skip type/content validation
  const isNil =
    node.getAttributeNS(XSI_NAMESPACE, "nil") === "true" || node.getAttribute("xsi:nil") === "true";
  if (isNil) {
    if (!schema.nillable) {
      return [
        {
          code: "NIL_NOT_ALLOWED",
          message: `Element <${schema.name}> has xsi:nil="true" but is not declared nillable in the schema.`,
          element: schema.name,
        },
      ];
    }
    if (text) {
      return [
        {
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> has xsi:nil="true" but contains text content.`,
          element: schema.name,
        },
      ];
    }
    return [];
  }

  // Skip validation if no type is specified
  if (!schema.type && !schema.listItemType && !schema.unionMemberTypes) return errors;

  // Handle xs:list validation — split text into tokens and validate each
  if (schema.listItemType) {
    const tokens = text.trim() ? text.trim().split(/\s+/) : [];
    const fakeSchema: XSDElement = { name: schema.name, type: schema.listItemType };
    for (const token of tokens) {
      const fakeNode = node.ownerDocument!.createElement("__token__");
      fakeNode.textContent = token;
      const tokenErrors = validateType(fakeNode as unknown as Element, fakeSchema);
      if (tokenErrors.length > 0) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> list item '${token}' is invalid for type ${schema.listItemType}.`,
          element: schema.name,
        });
      }
    }
    // List-level facet checks (applied to token count / full value, not individual items)
    const tokenCount = tokens.length;
    if (schema.length !== undefined && tokenCount !== schema.length) {
      errors.push({
        code: "RANGE_VIOLATION",
        message: `Element <${schema.name}> list must contain exactly ${schema.length} items, but found ${tokenCount}.`,
        element: schema.name,
        expected: schema.length,
        actual: tokenCount,
      });
    }
    if (schema.minLength !== undefined && tokenCount < schema.minLength) {
      errors.push({
        code: "RANGE_VIOLATION",
        message: `Element <${schema.name}> list must contain at least ${schema.minLength} items, but found ${tokenCount}.`,
        element: schema.name,
        expected: schema.minLength,
        actual: tokenCount,
      });
    }
    if (schema.maxLength !== undefined && tokenCount > schema.maxLength) {
      errors.push({
        code: "RANGE_VIOLATION",
        message: `Element <${schema.name}> list must contain at most ${schema.maxLength} items, but found ${tokenCount}.`,
        element: schema.name,
        expected: schema.maxLength,
        actual: tokenCount,
      });
    }
    if (schema.enumeration && schema.enumeration.length > 0) {
      if (!schema.enumeration.includes(text.trim())) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> list value "${text.trim()}" must be one of [${schema.enumeration.join(", ")}].`,
          element: schema.name,
          expected: schema.enumeration,
          actual: text.trim(),
        });
      }
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(text.trim())) {
        errors.push({
          code: "PATTERN_MISMATCH",
          message: `Element <${schema.name}> list value "${text.trim()}" does not match the pattern /${schema.pattern}/.`,
          element: schema.name,
        });
      }
    }
    return errors;
  }

  // Handle xs:union validation — value is valid if it matches any member type
  if (schema.unionMemberTypes && schema.unionMemberTypes.length > 0) {
    const valid = schema.unionMemberTypes.some((memberType) => {
      const fakeSchema: XSDElement = { name: schema.name, type: memberType };
      const fakeNode = node.ownerDocument!.createElement("__union__");
      fakeNode.textContent = text;
      return validateType(fakeNode as unknown as Element, fakeSchema).length === 0;
    });
    if (!valid) {
      errors.push({
        code: "TYPE_MISMATCH",
        message: `Element <${schema.name}> value "${text}" does not match any of the union member types [${schema.unionMemberTypes.join(", ")}].`,
        element: schema.name,
      });
    }
    return errors;
  }

  // Skip remaining validation if no type is specified (listItemType and unionMemberTypes handled above)
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

  if (schema.length !== undefined && text.length !== schema.length) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must have exactly ${schema.length} characters, but found length ${text.length}.`,
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
    case "xs:long":
      if (!/^-?\d+$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a long integer, but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:int": {
      const intVal = parseInt(text, 10);
      if (!/^-?\d+$/.test(text) || intVal < -2147483648 || intVal > 2147483647) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a 32-bit integer (-2147483648 to 2147483647), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    }
    case "xs:short": {
      const shortVal = parseInt(text, 10);
      if (!/^-?\d+$/.test(text) || shortVal < -32768 || shortVal > 32767) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a 16-bit integer (-32768 to 32767), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    }
    case "xs:byte": {
      const byteVal = parseInt(text, 10);
      if (!/^-?\d+$/.test(text) || byteVal < -128 || byteVal > 127) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be an 8-bit integer (-128 to 127), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    }
    case "xs:unsignedLong":
      if (!/^\d+$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a non-negative integer, but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:unsignedInt": {
      const uintVal = parseInt(text, 10);
      if (!/^\d+$/.test(text) || uintVal > 4294967295) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be an unsigned 32-bit integer (0 to 4294967295), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    }
    case "xs:unsignedShort": {
      const ushortVal = parseInt(text, 10);
      if (!/^\d+$/.test(text) || ushortVal > 65535) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be an unsigned 16-bit integer (0 to 65535), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    }
    case "xs:unsignedByte": {
      const ubyteVal = parseInt(text, 10);
      if (!/^\d+$/.test(text) || ubyteVal > 255) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be an unsigned 8-bit integer (0 to 255), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    }
    case "xs:nonNegativeInteger":
      if (!/^\d+$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a non-negative integer (>= 0), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:positiveInteger":
      if (!/^\d+$/.test(text) || parseInt(text, 10) <= 0) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a positive integer (> 0), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:negativeInteger":
      if (!/^-\d+$/.test(text) || parseInt(text, 10) >= 0) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a negative integer (< 0), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:nonPositiveInteger": {
      const nonPosVal = parseInt(text, 10);
      if (!/^-?\d+$/.test(text) || nonPosVal > 0) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a non-positive integer (<= 0), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    }
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
        validateDecimalPrecision(text, schema, errors);
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
    case "xs:dateTime":
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid dateTime (YYYY-MM-DDTHH:MM:SS), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:time":
      if (!/^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid time (HH:MM:SS), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:anyURI":
      if (!text) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a non-empty URI, but found empty value.`,
          element: schema.name,
        });
      }
      break;
    case "xs:normalizedString":
      if (/[\r\n\t]/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a normalized string (no CR, LF, or TAB), but found control characters.`,
          element: schema.name,
        });
      }
      break;
    case "xs:token":
      if (/^\s|\s$/.test(text) || /\s{2,}/.test(text) || /[\r\n\t]/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a token (no leading/trailing whitespace, no consecutive spaces), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:NMTOKEN":
      if (!/^[\w.:-]+$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid NMTOKEN, but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:NCName":
      if (!/^[a-zA-Z_][\w.-]*$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid NCName (no colons, starts with letter or underscore), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:Name":
      if (!/^[a-zA-Z_:][\w.:-]*$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid XML Name, but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:language":
      if (!/^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid language tag (e.g. en, en-GB), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:NMTOKENS": {
      const tokens = text.trim().split(/\s+/);
      if (tokens.length === 0 || !tokens.every((t) => /^[\w.:-]+$/.test(t))) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a whitespace-separated list of NMTOKENs, but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    }
    case "xs:duration":
      if (!/^-?P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/.test(text) || text === "P" || text === "-P") {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid ISO 8601 duration (e.g. P1Y2M3DT4H), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:gYear":
      if (!/^-?\d{4,}(Z|[+-]\d{2}:\d{2})?$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid gYear (e.g. 2024), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:gYearMonth":
      if (!/^-?\d{4,}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid gYearMonth (e.g. 2024-01), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:gMonth":
      if (!/^--\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid gMonth (e.g. --03), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:gDay":
      if (!/^---\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid gDay (e.g. ---15), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:gMonthDay":
      if (!/^--\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid gMonthDay (e.g. --03-15), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:hexBinary":
      if (!/^([0-9A-Fa-f]{2})*$/.test(text)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be a valid hexBinary (even-length hex string), but found "${text}".`,
          element: schema.name,
        });
      }
      break;
    case "xs:base64Binary":
      if (!/^[A-Za-z0-9+/\s]*={0,2}$/.test(text) || (text.replace(/\s/g, "").length % 4 !== 0)) {
        errors.push({
          code: "TYPE_MISMATCH",
          message: `Element <${schema.name}> must be valid Base64-encoded binary, but found "${text}".`,
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

/**
 * Helper function to validate decimal precision facets (totalDigits, fractionDigits).
 */
function validateDecimalPrecision(
  text: string,
  schema: XSDElement,
  errors: ValidationError[],
): void {
  const stripped = text.startsWith("-") ? text.slice(1) : text;
  const [intPart, fracPart = ""] = stripped.split(".");
  const totalCount = intPart.length + fracPart.length;
  const fracCount = fracPart.length;

  if (schema.totalDigits !== undefined && totalCount > schema.totalDigits) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must have at most ${schema.totalDigits} total digits, but found ${totalCount}.`,
      element: schema.name,
    });
  }

  if (schema.fractionDigits !== undefined && fracCount > schema.fractionDigits) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Element <${schema.name}> must have at most ${schema.fractionDigits} fraction digits, but found ${fracCount}.`,
      element: schema.name,
    });
  }
}
