import { NodeValidationStep } from "@lib/types/validation.js";
import { XSDElement } from "@lib/types/xsd.js";
import { directChildElements } from "@lib/validator/utils/schemaMatch.js";

export const validateSequenceOrder: NodeValidationStep = (
  node: Element,
  schema: XSDElement,
): ReturnType<NodeValidationStep> => {
  if (!schema.children || schema.children.length === 0) return [];

  // Build index map only from sequence-ordered children (skip xs:all members)
  const schemaIndexMap = new Map<string, number>();
  schema.children
    .filter((child) => !child.inAll)
    .forEach((child, i) => schemaIndexMap.set(`${child.namespace ?? ""}:${child.name.toLowerCase()}`, i));

  if (schemaIndexMap.size === 0) return [];

  const xmlChildren = directChildElements(node);

  let lastSchemaIndex = -1;
  for (const child of xmlChildren) {
    const key = `${child.namespaceURI ?? ""}:${(child.localName ?? child.nodeName).toLowerCase()}`;
    const schemaIndex = schemaIndexMap.get(key);
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
