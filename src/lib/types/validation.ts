import { XSDElement } from "@lib/types/xsd";
import { Element } from "@xmldom/xmldom";

export type ValidationResult = {
    valid: boolean;
    errors: string[];
}

// For node-level validations
export type NodeValidationStep = (node: Element, schema: XSDElement) => string[];

// For global validations
export type GlobalValidationStep = (nodes: Element[], schema: XSDElement) => string[];
