import { ValidationError } from "@lib/types/validation.js";
import { XSDElement, XSDSchema } from "@lib/types/xsd.js";
import { XMLDocument } from "@lib/types/xml.js";
import { isValidBuiltinType } from "@lib/validator/builtinTypeCheck.js";
import { directChildElements, matchesSchemaElement } from "@lib/validator/utils/schemaMatch.js";

type RefValue = {
  value: string;
};

const normalizeValue = (value: string | null | undefined): string => (value ?? "").trim();

const isIdType = (type?: string): boolean => type === "xs:ID";
const isIdRefType = (type?: string): boolean => type === "xs:IDREF" || type === "xs:IDREFS";

function collectSemanticValues(
  xmlNode: Element,
  schema: XSDElement,
  ids: Map<string, number>,
  refs: RefValue[],
): void {
  if (isIdType(schema.type)) {
    const value = normalizeValue(xmlNode.textContent);
    if (value) {
      ids.set(value, (ids.get(value) ?? 0) + 1);
    }
  }

  if (isIdRefType(schema.type)) {
    const value = normalizeValue(xmlNode.textContent);
    if (value && isValidBuiltinType(value, schema.type!)) {
      const tokens = schema.type === "xs:IDREFS" ? value.split(/\s+/).filter(Boolean) : [value];
      tokens.forEach((token) => refs.push({ value: token }));
    }
  }

  for (const attr of schema.attributes ?? []) {
    const value = attr.namespace ? xmlNode.getAttributeNS(attr.namespace, attr.name) : xmlNode.getAttribute(attr.name);
    if (!value) continue;

    if (isIdType(attr.type)) {
      const normalized = normalizeValue(value);
      if (normalized) {
        ids.set(normalized, (ids.get(normalized) ?? 0) + 1);
      }
    }

    if (isIdRefType(attr.type) && isValidBuiltinType(value, attr.type!)) {
      const tokens = attr.type === "xs:IDREFS" ? value.trim().split(/\s+/).filter(Boolean) : [value.trim()];
      tokens.forEach((token) => refs.push({ value: token }));
    }
  }
}

function walkSchema(
  xmlNode: Element,
  schema: XSDElement,
  ids: Map<string, number>,
  refs: RefValue[],
): void {
  collectSemanticValues(xmlNode, schema, ids, refs);

  const childSchemas = [
    ...(schema.children || []),
    ...((schema.choices || []).flatMap((choice) => choice.elements)),
  ];

  for (const childSchema of childSchemas) {
    directChildElements(xmlNode)
      .filter((child) => matchesSchemaElement(child, childSchema))
      .forEach((childNode) => walkSchema(childNode, childSchema, ids, refs));
  }
}

export const validateIdSemantics = (xmlDoc: XMLDocument, schema: XSDSchema): ValidationError[] => {
  const errors: ValidationError[] = [];
  const ids = new Map<string, number>();
  const refs: RefValue[] = [];

  for (const rootSchema of schema.elements) {
    Array.from(xmlDoc.childNodes)
      .filter(
        (child): child is Element =>
          child.nodeType === 1 && matchesSchemaElement(child as Element, rootSchema),
      )
      .forEach((node) => walkSchema(node, rootSchema, ids, refs));
  }

  for (const [value, count] of ids.entries()) {
    if (count > 1) {
      errors.push({
        code: "DUPLICATE_ID",
        message: `ID value "${value}" appears ${count} times in the document.`,
        expected: 1,
        actual: count,
      });
    }
  }

  const knownIds = new Set(ids.keys());
  for (const ref of refs) {
    if (!knownIds.has(ref.value)) {
      errors.push({
        code: "UNRESOLVED_IDREF",
        message: `IDREF value "${ref.value}" does not match any ID in the document.`,
        expected: "existing xs:ID",
        actual: ref.value,
      });
    }
  }

  return errors;
};
