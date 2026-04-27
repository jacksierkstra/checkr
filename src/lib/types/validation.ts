import { XSDElement } from "@lib/types/xsd";

export type ValidationErrorCode =
  | "MISSING_REQUIRED_ELEMENT"
  | "UNEXPECTED_ELEMENT"
  | "TYPE_MISMATCH"
  | "PATTERN_MISMATCH"
  | "RANGE_VIOLATION"
  | "OCCURRENCE_VIOLATION"
  | "ATTRIBUTE_MISSING"
  | "ATTRIBUTE_INVALID"
  | "CHOICE_VIOLATION"
  | "ABSTRACT_ELEMENT"
  | "PARSE_ERROR";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  element?: string;
  expected?: unknown;
  actual?: unknown;
}

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

// For node-level validations
export type NodeValidationStep = (node: Element, schema: XSDElement) => ValidationError[];

// For global validations
export type GlobalValidationStep = (nodes: Element[], schema: XSDElement) => ValidationError[];
