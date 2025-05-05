import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { XMLDocument } from "@lib/types/xml";

/**
 * Validates that all required root elements are present in the document
 */
export const validateRootElements = (
  xmlDoc: XMLDocument, 
  schema: XSDSchema
): string[] => {
  const errors: string[] = [];

  // Check each root element definition from the schema
  for (const element of schema.elements) {
    // Skip optional elements (minOccurs=0)
    if (element.minOccurs === 0) {
      continue;
    }

    // Find matching elements in the document
    const matchingNodes = element.namespace
      ? xmlDoc.getElementsByTagNameNS(element.namespace, element.name)
      : xmlDoc.getElementsByTagName(element.name);

    // Element is required but not found (or not enough instances found)
    const minOccurs = element.minOccurs ?? 1; // Default to 1 if not specified
    if (matchingNodes.length < minOccurs) {
      errors.push(
        `Root element <${element.name}> is required in the document but ${
          matchingNodes.length === 0 ? "is missing" : "has insufficient occurrences"
        }.`
      );
    }
  }

  return errors;
};
