import { NodeValidationStep } from "@lib/types/validation";
import { XSDElement } from "@lib/types/xsd";

export const validateSequenceOrder: NodeValidationStep = (
  node: Element,
  schema: XSDElement,
): ReturnType<NodeValidationStep> => {
  if (!schema.children || schema.children.length === 0) return [];

  const schemaIndexMap = new Map<string, number>();
  schema.children.forEach((child, i) => schemaIndexMap.set(child.name, i));

  const xmlChildren = Array.from(node.childNodes).filter(
    (n): n is Element => n.nodeType === 1,
  ) as Element[];

  let lastSchemaIndex = -1;
  for (const child of xmlChildren) {
    const schemaIndex = schemaIndexMap.get(child.localName ?? child.nodeName);
    if (schemaIndex === undefined) continue;
    if (schemaIndex < lastSchemaIndex) {
      return [
        {
          code: "SEQUENCE_VIOLATION",
          message: `Element '${child.localName ?? child.nodeName}' appears out of sequence order`,
        },
      ];
    }
    lastSchemaIndex = schemaIndex;
  }

  return [];
};
