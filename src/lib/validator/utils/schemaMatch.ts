import { XSDAttribute, XSDElement } from "@lib/types/xsd.js";

const normalizeNamespace = (namespace: string | null | undefined): string | undefined =>
  namespace === null || namespace === undefined || namespace === "" ? undefined : namespace;

export const matchesSchemaElement = (node: Element, schema: XSDElement): boolean => {
  const nodeName = (node.localName || node.tagName || "").toLowerCase();
  if (nodeName !== schema.name.toLowerCase()) return false;
  return normalizeNamespace(node.namespaceURI) === normalizeNamespace(schema.namespace);
};

export const matchesSchemaAttribute = (attr: Attr, schemaAttr: XSDAttribute): boolean => {
  const attrName = (attr.localName || attr.name || "").toLowerCase();
  if (attrName !== schemaAttr.name.toLowerCase()) return false;
  return normalizeNamespace(attr.namespaceURI) === normalizeNamespace(schemaAttr.namespace);
};

export const directChildElements = (node: Element): Element[] =>
  Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1);
