import { NodeValidationStep, ValidationError } from "@lib/types/validation";

const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

export const validateRequiredChildren: NodeValidationStep = (xmlNode, schemaElement) => {
  const errors: ValidationError[] = [];

  // Skip required children check when element is explicitly nil
  const isNil =
    xmlNode.getAttributeNS(XSI_NAMESPACE, "nil") === "true" ||
    xmlNode.getAttribute("xsi:nil") === "true";
  if (isNil) return errors;

  if (!schemaElement.children) return errors;

  // Use xmlNode.children if available; otherwise fall back to childNodes filtered to Elements.
  const childrenElements = xmlNode.childNodes
    ? Array.from(xmlNode.childNodes).filter((child): child is Element => child.nodeType === 1)
    : [];

  for (const childDef of schemaElement.children) {
    const minOccurs = childDef.minOccurs ?? 1; // Default to 1 if not specified
    // Compare names in a case-insensitive manner
    const matchingChildren = childrenElements.filter(
      (child) =>
        child?.localName?.toLowerCase() === childDef.name.toLowerCase() ||
        child?.tagName?.toLowerCase() === childDef.name.toLowerCase(),
    );

    if (matchingChildren.length < minOccurs) {
      errors.push({
        code: "MISSING_REQUIRED_ELEMENT",
        message: `Element <${childDef.name}> is required inside <${schemaElement.name}> but ${matchingChildren.length === 0 ? "is missing" : "has insufficient occurrences"}.`,
        element: childDef.name,
      });
    }
  }

  return errors;
};
