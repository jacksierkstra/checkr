import { ValidationError } from "@lib/types/validation.js";
import { XSDElement, XSDSchema } from "@lib/types/xsd.js";
import { XMLDocument } from "@lib/types/xml.js";
import { directChildElements, matchesSchemaElement } from "@lib/validator/utils/schemaMatch.js";

function evaluateXPathNodes(context: Node, expression: string): Node[] {
  const doc = context.ownerDocument ?? (context as Document);
  const result = doc.evaluate(
    expression,
    context,
    null,
    XPathResult.ORDERED_NODE_ITERATOR_TYPE,
    null,
  );

  const nodes: Node[] = [];
  let current = result.iterateNext();
  while (current) {
    nodes.push(current);
    current = result.iterateNext();
  }
  return nodes;
}

function nodeValue(node: Node): string {
  return (node.nodeType === 2 ? node.nodeValue ?? "" : node.textContent ?? "").trim();
}

function evaluateFieldValues(context: Node, xpath: string): string[] {
  return evaluateXPathNodes(context, xpath)
    .map((node) => nodeValue(node))
    .filter(Boolean);
}

function collectConstraints(
  xmlNode: Element,
  schema: XSDElement,
  errors: ValidationError[],
): void {
  const constraints = schema.identityConstraints ?? [];
  if (constraints.length === 0) return;

  const valuesByName = new Map<string, Set<string>>();

  for (const constraint of constraints) {
    if (constraint.kind === "keyref") continue;

    const selectedNodes = evaluateXPathNodes(xmlNode, constraint.selector);
    if (selectedNodes.length === 0) {
      if (constraint.kind === "key") {
        errors.push({
          code: "MISSING_REQUIRED_ELEMENT",
          message: `Key constraint '${constraint.name}' did not select any nodes inside <${schema.name}>.`,
          element: schema.name,
        });
      }
      continue;
    }

    const localValues = new Set<string>();

    for (const selectedNode of selectedNodes) {
      const fieldValues = constraint.fields.flatMap((field) => evaluateFieldValues(selectedNode, field));
      if (fieldValues.length === 0) {
        if (constraint.kind === "key") {
          errors.push({
            code: "MISSING_REQUIRED_ELEMENT",
            message: `Key constraint '${constraint.name}' is missing a required field inside <${schema.name}>.`,
            element: schema.name,
          });
        }
        continue;
      }

      const valueKey = fieldValues.join("\u0000");
      if (constraint.kind === "unique" || constraint.kind === "key") {
        if (localValues.has(valueKey)) {
          errors.push({
            code: "UNIQUENESS_VIOLATION",
            message: `Identity constraint '${constraint.name}' has duplicate values inside <${schema.name}>.`,
            element: schema.name,
            expected: "unique field values",
            actual: valueKey,
          });
        } else {
          localValues.add(valueKey);
        }
      }
    }

    valuesByName.set(constraint.name, new Set([...localValues]));
  }

  for (const constraint of constraints) {
    if (constraint.kind !== "keyref" || !constraint.refer) continue;

    const selectedNodes = evaluateXPathNodes(xmlNode, constraint.selector);
    const referenced = valuesByName.get(constraint.refer);
    for (const selectedNode of selectedNodes) {
      const fieldValues = constraint.fields.flatMap((field) => evaluateFieldValues(selectedNode, field));
      for (const fieldValue of fieldValues) {
        if (!referenced?.has(fieldValue)) {
          errors.push({
            code: "REFERENCE_VIOLATION",
            message: `Identity constraint '${constraint.name}' references missing value '${fieldValue}'.`,
            element: schema.name,
            expected: constraint.refer,
            actual: fieldValue,
          });
        }
      }
    }
  }

  const childSchemas = [
    ...(schema.children || []),
    ...((schema.choices || []).flatMap((choice) => choice.elements)),
  ];

  for (const childSchema of childSchemas) {
    const childNodes = directChildElements(xmlNode).filter((child) => matchesSchemaElement(child, childSchema));
    childNodes.forEach((childNode) => collectConstraints(childNode, childSchema, errors));
  }
}

export const validateIdentityConstraints = (xmlDoc: XMLDocument, schema: XSDSchema): ValidationError[] => {
  const errors: ValidationError[] = [];

  for (const rootSchema of schema.elements) {
    const rootNodes = Array.from(xmlDoc.childNodes).filter(
      (child): child is Element =>
        child.nodeType === 1 && matchesSchemaElement(child as Element, rootSchema),
    );
    rootNodes.forEach((node) => collectConstraints(node, rootSchema, errors));
  }

  return errors;
};
