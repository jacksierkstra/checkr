import { NodeValidationStep, ValidationError } from "@lib/types/validation.js";
import { XSDAttribute } from "@lib/types/xsd.js";
import { isValidBuiltinType } from "@lib/validator/builtinTypeCheck.js";
import { matchesSchemaAttribute } from "@lib/validator/utils/schemaMatch.js";

const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

function matchesNamespaceConstraint(ns: string | null | undefined, constraint: string | undefined): boolean {
  if (!constraint) return true;
  if (constraint === "##local") return !ns;
  if (constraint.startsWith("##other:")) {
    const targetNs = constraint.slice(8);
    return !!ns && ns !== targetNs;
  }
  return ns === constraint; // specific URI
}

function validateAttrType(
  attrName: string,
  elementName: string,
  value: string,
  type: string | undefined,
  notations?: string[],
): ValidationError | null {
  if (!type || !value.trim()) return null;
  if (type === "xs:NOTATION" && notations && notations.length > 0) {
    // Strip namespace prefix for comparison (notation names are local)
    const localValue = value.replace(/^.*:/, "");
    if (!notations.includes(localValue) && !notations.includes(value)) {
      return {
        code: "ATTRIBUTE_INVALID",
        message: `Attribute '${attrName}' in element <${elementName}> references undeclared notation '${value}'.`,
        element: elementName,
        expected: notations.join(", "),
        actual: value,
      };
    }
    return null; // QName format already validated by isValidBuiltinType
  }
  if (isValidBuiltinType(value, type)) return null;
  return {
    code: "ATTRIBUTE_INVALID",
    message: `Attribute '${attrName}' in element <${elementName}> has an invalid value '${value}' for type ${type}.`,
    element: elementName,
  };
}

function validateAttrFacets(
  attrName: string,
  elementName: string,
  value: string,
  attr: XSDAttribute,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (attr.enumeration && !attr.enumeration.includes(value)) {
    errors.push({
      code: "PATTERN_MISMATCH",
      message: `Attribute '${attrName}' in element <${elementName}> must be one of [${attr.enumeration.join(", ")}], but found "${value}".`,
      element: elementName,
      expected: attr.enumeration,
      actual: value,
    });
  }

  if (attr.pattern) {
    const regex = new RegExp(attr.pattern);
    if (!regex.test(value)) {
      errors.push({
        code: "PATTERN_MISMATCH",
        message: `Attribute '${attrName}' in element <${elementName}> does not match pattern /${attr.pattern}/.`,
        element: elementName,
        expected: attr.pattern,
        actual: value,
      });
    }
  }

  if (attr.length != null && value.length !== attr.length) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Attribute '${attrName}' in element <${elementName}> must have length ${attr.length}, but found ${value.length}.`,
      element: elementName,
      expected: attr.length,
      actual: value.length,
    });
  }

  if (attr.minLength != null && value.length < attr.minLength) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Attribute '${attrName}' in element <${elementName}> must be at least length ${attr.minLength}, but found ${value.length}.`,
      element: elementName,
      expected: attr.minLength,
      actual: value.length,
    });
  }

  if (attr.maxLength != null && value.length > attr.maxLength) {
    errors.push({
      code: "RANGE_VIOLATION",
      message: `Attribute '${attrName}' in element <${elementName}> must be at most length ${attr.maxLength}, but found ${value.length}.`,
      element: elementName,
      expected: attr.maxLength,
      actual: value.length,
    });
  }

  const numVal = parseFloat(value);
  if (!isNaN(numVal)) {
    if (attr.minInclusive != null && numVal < attr.minInclusive) {
      errors.push({
        code: "RANGE_VIOLATION",
        message: `Attribute '${attrName}' in element <${elementName}> must be >= ${attr.minInclusive}, but found ${numVal}.`,
        element: elementName,
        expected: attr.minInclusive,
        actual: numVal,
      });
    }
    if (attr.maxInclusive != null && numVal > attr.maxInclusive) {
      errors.push({
        code: "RANGE_VIOLATION",
        message: `Attribute '${attrName}' in element <${elementName}> must be <= ${attr.maxInclusive}, but found ${numVal}.`,
        element: elementName,
        expected: attr.maxInclusive,
        actual: numVal,
      });
    }
    if (attr.minExclusive != null && numVal <= attr.minExclusive) {
      errors.push({
        code: "RANGE_VIOLATION",
        message: `Attribute '${attrName}' in element <${elementName}> must be > ${attr.minExclusive}, but found ${numVal}.`,
        element: elementName,
        expected: attr.minExclusive,
        actual: numVal,
      });
    }
    if (attr.maxExclusive != null && numVal >= attr.maxExclusive) {
      errors.push({
        code: "RANGE_VIOLATION",
        message: `Attribute '${attrName}' in element <${elementName}> must be < ${attr.maxExclusive}, but found ${numVal}.`,
        element: elementName,
        expected: attr.maxExclusive,
        actual: numVal,
      });
    }
  }

  return errors;
}

export const validateAttributes: NodeValidationStep = (node, schema) => {
  const hasAttributes = schema.attributes && schema.attributes.length > 0;
  const hasWildcard = schema.allowAnyAttribute;
  if (!hasAttributes && !hasWildcard) return [];
  const declaredAttributes = schema.attributes ?? [];

  const errors: ValidationError[] = declaredAttributes.flatMap((attr: XSDAttribute) => {
    const value = attr.namespace ? node.getAttributeNS(attr.namespace, attr.name) : node.getAttribute(attr.name);
    const attrErrors: ValidationError[] = [];

    if (attr.use === "prohibited") {
      if (value !== null) {
        attrErrors.push({
          code: "ATTRIBUTE_INVALID",
          message: `Attribute '${attr.name}' is prohibited on element <${schema.name}>.`,
          element: schema.name,
        });
      }
      return attrErrors;
    }

    // Apply default value for absent optional attributes
    const effectiveValue =
      value === null && attr.use !== "required" && attr.default !== undefined
        ? attr.default
        : value;

    // Required attribute check (treat empty string as missing)
    if (attr.use === "required" && (!value || value.trim() === "")) {
      attrErrors.push({
        code: "ATTRIBUTE_MISSING",
        message: `Missing required attribute '${attr.name}' in element <${schema.name}>.`,
        element: schema.name,
      });
    }

    // Fixed value enforcement
    if (attr.fixed !== undefined && effectiveValue !== null && effectiveValue !== attr.fixed) {
      attrErrors.push({
        code: "ATTRIBUTE_INVALID",
        message: `Attribute '${attr.name}' in element <${schema.name}> must be fixed to '${attr.fixed}', but found '${effectiveValue}'.`,
        element: schema.name,
      });
    }

    // Type validation for present, non-empty values
    if (effectiveValue !== null && effectiveValue.trim() !== "") {
      const typeError = validateAttrType(attr.name, schema.name, effectiveValue, attr.type, schema.notations);
      if (typeError) attrErrors.push(typeError);
      attrErrors.push(...validateAttrFacets(attr.name, schema.name, effectiveValue, attr));
    }

    return attrErrors;
  });

  // Check for unexpected attributes (attributes in XML not declared in schema)
  const strictWildcard = schema.allowAnyAttribute && schema.anyAttributeProcessContents === "strict";
  if (!schema.allowAnyAttribute || strictWildcard) {
    Array.from(node.attributes).forEach((attr) => {
      // Allow xmlns namespace declarations and xsi:* attributes
      if (attr.namespaceURI === XMLNS_NAMESPACE) return;
      if (attr.namespaceURI === XSI_NAMESPACE) return;
      if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) return;

      const declared = declaredAttributes.some((declaredAttr) => matchesSchemaAttribute(attr, declaredAttr));
      if (!declared) {
        errors.push({
          code: "ATTRIBUTE_INVALID",
          message: `Attribute '${attr.localName || attr.name}' in element <${schema.name}> is not declared in the schema.`,
          element: schema.name,
        });
      }
    });
  } else if (schema.allowAnyAttribute && schema.anyAttributeNamespace) {
    // Namespace constraint for wildcard attributes
    Array.from(node.attributes).forEach((attr) => {
      if (attr.namespaceURI === XMLNS_NAMESPACE) return;
      if (attr.namespaceURI === XSI_NAMESPACE) return;
      if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) return;
      // Check if declared (declared attrs are always allowed)
      const declared = declaredAttributes.some((declaredAttr) => matchesSchemaAttribute(attr, declaredAttr));
      if (declared) return;
      if (!matchesNamespaceConstraint(attr.namespaceURI, schema.anyAttributeNamespace)) {
        errors.push({
          code: "ATTRIBUTE_INVALID",
          message: `Attribute '${attr.localName || attr.name}' with namespace "${attr.namespaceURI ?? ""}" does not match xs:anyAttribute namespace constraint "${schema.anyAttributeNamespace}" in <${schema.name}>.`,
          element: schema.name,
          expected: schema.anyAttributeNamespace,
          actual: attr.namespaceURI ?? "",
        });
      }
    });
  }

  return errors;
};
