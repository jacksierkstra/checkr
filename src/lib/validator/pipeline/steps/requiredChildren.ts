import { NodeValidationStep } from "@lib/types/validation";
import { Element } from "@xmldom/xmldom";

export const validateRequiredChildren: NodeValidationStep = (xmlNode, schemaElement) => {
  const errors: string[] = [];

  if (!schemaElement.children) return errors;

  // Use xmlNode.children if available; otherwise fall back to childNodes filtered to Elements.
  const childrenElements = xmlNode.childNodes
    ? Array.from(xmlNode.childNodes).filter((child): child is Element => child.nodeType === 1) : [];

  for (const childDef of schemaElement.children) {
    const minOccurs = childDef.minOccurs ?? 1; // Default to 1 if not specified
    // Compare names in a case-insensitive manner
    const matchingChildren = childrenElements.filter(
      child => child?.localName?.toLowerCase() === childDef.name.toLowerCase() ||
              child?.tagName?.toLowerCase() === childDef.name.toLowerCase()
    );

    if (matchingChildren.length < minOccurs) {
      errors.push(
        `Element <${childDef.name}> is required inside <${schemaElement.name}> but ${matchingChildren.length === 0 ? "is missing" : "has insufficient occurrences"}.`
      );
    }
  }

  return errors;
};
