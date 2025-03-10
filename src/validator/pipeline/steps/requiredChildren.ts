import { NodeValidationStep } from "@lib/types/validation";

export const validateRequiredChildren: NodeValidationStep = (xmlNode, schemaElement) => {
  const errors: string[] = [];
  
  if (!schemaElement.children) return errors;
  
  // Use xmlNode.children if available; otherwise fall back to childNodes filtered to Elements.
  const childrenElements = xmlNode.children 
    ? Array.from(xmlNode.children)
    : Array.from(xmlNode.childNodes).filter((child): child is Element => child.nodeType === 1);
  
  for (const childDef of schemaElement.children) {
    const minOccurs = childDef.minOccurs ?? 1;
    // Compare names in a case-insensitive manner (or use localName as is if you prefer)
    const matchingChildren = childrenElements.filter(
      child => child.localName.toLowerCase() === childDef.name.toLowerCase()
    );
    
    if (matchingChildren.length < minOccurs) {
      errors.push(
        `Element <${childDef.name}> is required inside <${schemaElement.name}> but is missing.`
      );
    }
  }
  
  return errors;
};
