import { ValidationError, ValidationResult } from "@lib/types/validation";
import { XMLDocument } from "@lib/types/xml";
import { XSDChoice, XSDElement, XSDSchema } from "@lib/types/xsd";
import {
  GlobalValidationPipeline,
  GlobalValidationPipelineImpl,
} from "@lib/validator/pipeline/global";
import { NodeValidationPipeline, NodeValidationPipelineImpl } from "@lib/validator/pipeline/node";
import { validateAttributes } from "@lib/validator/pipeline/steps/attributes";
import { validateConstraints } from "@lib/validator/pipeline/steps/constraints";
import { validateElementFixed } from "@lib/validator/pipeline/steps/elementFixed";
import { validateAllChildren } from "@lib/validator/pipeline/steps/allChildren";
import { validateMixedContent } from "@lib/validator/pipeline/steps/mixedContent";
import { validateOccurrence } from "@lib/validator/pipeline/steps/occurence";
import { validateRequiredChildren } from "@lib/validator/pipeline/steps/requiredChildren";
import { validateType } from "@lib/validator/pipeline/steps/type";
import { validateAbstract } from "@lib/validator/pipeline/steps/abstract";
import { validateRootElements } from "@lib/validator/pipeline/steps/rootElements";
import { validateUnexpectedElements } from "@lib/validator/pipeline/steps/unexpectedElements";
import { validateSequenceOrder } from "@lib/validator/pipeline/steps/sequenceOrder";
import { XMLParser } from "@lib/xml/parser";
import { XSDParser } from "@lib/xsd/parser";

export interface Validator {
  validate(xml: string, xsd: string): ValidationResult;
  validateAsync(xml: string, xsd: string): Promise<ValidationResult>;
}

export class ValidatorImpl implements Validator {
  private nodePipeline: NodeValidationPipeline;
  private globalPipeline: GlobalValidationPipeline;

  constructor(
    private xmlParser: XMLParser,
    private xsdParser: XSDParser,
  ) {
    // Node-level pipeline (type checks, attribute checks, etc.)
    this.nodePipeline = new NodeValidationPipelineImpl()
      .addStep(validateAbstract)
      .addStep(validateType)
      .addStep(validateElementFixed)
      .addStep(validateMixedContent)
      .addStep(validateAllChildren)
      .addStep(validateAttributes)
      .addStep(validateConstraints)
      .addStep(validateRequiredChildren)
      .addStep(validateUnexpectedElements)
      .addStep(validateSequenceOrder);

    // Global pipeline (occurrence checks, etc.)
    this.globalPipeline = new GlobalValidationPipelineImpl().addStep(validateOccurrence);
  }

  private validateElements(xmlDoc: XMLDocument, elements: XSDElement[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const elementsByName = new Map(elements.map((e) => [e.name.toLowerCase(), e]));

    // Check for unexpected root-level elements
    if (elements.length > 0) {
      const declaredNames = new Set(elements.map((e) => e.name.toLowerCase()));
      Array.from(xmlDoc.childNodes).forEach((child) => {
        if (child.nodeType !== 1) return;
        const name = (
          (child as Element).localName ||
          (child as Element).tagName ||
          ""
        ).toLowerCase();
        if (name && !declaredNames.has(name)) {
          errors.push({
            code: "UNEXPECTED_ELEMENT",
            message: `Root element <${name}> is not declared in the schema.`,
            element: name,
          });
        }
      });
    }

    for (const schemaElement of elements) {
      // Only count direct children of the document root (not deep descendants).
      // getElementsByTagName would count every occurrence in the tree, producing
      // false OCCURRENCE_VIOLATION errors when the same element name appears at
      // multiple nesting levels.
      const nodes = Array.from(xmlDoc.childNodes).filter(
        (n): n is Element =>
          n.nodeType === 1 &&
          ((n as Element).localName === schemaElement.name ||
            (n as Element).tagName === schemaElement.name),
      );

      // Global checks (e.g., occurrence constraints) for this element
      const globalErrors = this.globalPipeline.execute(nodes, schemaElement);
      errors.push(...globalErrors);

      // Node-level checks for each instance of this element
      for (const node of nodes) {
        const nodeErrors = this.validateNode(node, schemaElement, elementsByName);
        errors.push(...nodeErrors);
      }
    }

    return errors;
  }

  private validateNode(
    node: Element,
    schemaElement: XSDElement,
    elementsByName?: Map<string, XSDElement>,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Node-level validation pipeline
    errors.push(...this.nodePipeline.execute(node, schemaElement));

    // If choices exist, validate them
    if (schemaElement.choices && schemaElement.choices.length > 0) {
      // For simplicity, assume 1 XSDChoice
      const [choiceDef] = schemaElement.choices;
      errors.push(...this.validateChoice(node, choiceDef));
    }

    // Recursively validate direct children only if they exist in the XML
    // The requiredChildren validation step already handles missing required children
    if (schemaElement.children && schemaElement.children.length > 0) {
      const childrenErrors = schemaElement.children.flatMap((childSchema) => {
        const childNodes = node.hasChildNodes() ? Array.from(node.childNodes) : [];
        const acceptedNames = new Set([
          childSchema.name.toLowerCase(),
          ...(childSchema.allowedSubstitutes ?? []).map((s) => s.toLowerCase()),
        ]);
        const filtered = childNodes
          .filter((child): child is Element => child.nodeType === 1)
          .filter((child) => {
            const childName = child.tagName || child.localName;
            return childName && acceptedNames.has(childName.toLowerCase());
          });

        // Only validate children that exist in the document
        // Missing required children are handled by validateRequiredChildren
        return filtered.length > 0
          ? [
              ...this.globalPipeline.execute(filtered, childSchema),
              ...filtered.flatMap((childNode) => {
                // If this child is a substitute (different name), look up its own schema
                const childName = (childNode.localName || childNode.tagName || "").toLowerCase();
                const isSubstitute = childName !== childSchema.name.toLowerCase();
                const effectiveSchema =
                  isSubstitute && elementsByName
                    ? (elementsByName.get(childName) ?? childSchema)
                    : childSchema;
                return this.validateNode(childNode, effectiveSchema, elementsByName);
              }),
            ]
          : [];
      });

      errors.push(...childrenErrors);
    }

    return errors;
  }

  private validateChoice(node: Element, choice: XSDChoice): ValidationError[] {
    // Sum how many total child elements from the choice are present
    const matches = choice.elements.reduce((count, el) => {
      return count + node.getElementsByTagName(el.name).length;
    }, 0);

    // If exactly 1 is found, good
    if (matches === 1) return [];

    // Otherwise, produce an error
    return [
      {
        code: "CHOICE_VIOLATION",
        message: `Choice error: Expected exactly one of [${choice.elements.map((x) => x.name).join(", ")}], but found ${matches}.`,
      },
    ];
  }

  validate(xml: string, xsd: string): ValidationResult {
    let schema: XSDSchema;
    let xmlDoc: XMLDocument;

    // Parse errors are returned as ValidationResult values
    try {
      schema = this.xsdParser.parse(xsd);
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            code: "PARSE_ERROR",
            message: `XSD parse error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }

    try {
      xmlDoc = this.xmlParser.parse(xml);
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            code: "PARSE_ERROR",
            message: `XML parse error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }

    // Programmer errors (bugs in pipeline steps) propagate — do NOT catch
    const rootElementErrors = validateRootElements(xmlDoc, schema);
    const elementErrors = this.validateElements(xmlDoc, schema.elements);
    const errors = [...rootElementErrors, ...elementErrors];

    return { valid: errors.length === 0, errors };
  }

  validateAsync(xml: string, xsd: string): Promise<ValidationResult> {
    return Promise.resolve(this.validate(xml, xsd));
  }
}
