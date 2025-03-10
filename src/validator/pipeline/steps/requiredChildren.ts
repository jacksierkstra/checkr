import { NodeValidationStep } from "@lib/types/validation";

export const validateRequiredChildren: NodeValidationStep = (xmlNode, schemaElement) => {
  const errors: string[] = [];
  
  if (!schemaElement.children) return errors;
  
  for (const childDef of schemaElement.children) {
    const minOccurs = childDef.minOccurs ?? 1;
  
    const matchingChildren = Array.from(xmlNode.childNodes)
      .filter((child): child is Element => child.nodeType === 1)
      .filter(child => child.localName === childDef.name);
  
    if (matchingChildren.length < minOccurs) {
      errors.push(
        `Element <${childDef.name}> is required inside <${schemaElement.name}> but is missing.`
      );
    }
  }
  
  return errors;
};
