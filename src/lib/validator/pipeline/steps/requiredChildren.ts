import { NodeValidationStep, ValidationError } from "@lib/types/validation";
import { matchesSchemaElement, directChildElements } from "@lib/validator/utils/schemaMatch";

const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

export const validateRequiredChildren: NodeValidationStep = (xmlNode, schemaElement) => {
  const errors: ValidationError[] = [];

  // Skip required children check when element is explicitly nil
  const isNil =
    xmlNode.getAttributeNS(XSI_NAMESPACE, "nil") === "true" ||
    xmlNode.getAttribute("xsi:nil") === "true";
  if (isNil) return errors;

  if (!schemaElement.children) return errors;

  const childrenElements = directChildElements(xmlNode);

  for (const childDef of schemaElement.children) {
    const minOccurs = childDef.minOccurs ?? 1; // Default to 1 if not specified
    const acceptedNames = new Set([
      ...(childDef.allowedSubstitutes ?? []).map((s) => s.toLowerCase()),
      ...(childDef.blockedSubstitutes ?? []).map((s) => s.toLowerCase()),
    ]);
    // Compare names in a case-insensitive manner, including substitution group members
    const matchingChildren = childrenElements.filter(
      (child) => {
        return matchesSchemaElement(child, childDef) || acceptedNames.has((child?.localName || child?.tagName || "").toLowerCase());
      }
    );

    if (matchingChildren.length < minOccurs) {
      // If the element is absent but has a default, treat it as present
      if (matchingChildren.length === 0 && childDef.default !== undefined) continue;
      errors.push({
        code: "MISSING_REQUIRED_ELEMENT",
        message: `Element <${childDef.name}> is required inside <${schemaElement.name}> but ${matchingChildren.length === 0 ? "is missing" : "has insufficient occurrences"}.`,
        element: childDef.name,
      });
    }
  }

  return errors;
};
