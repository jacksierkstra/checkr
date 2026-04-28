import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { XMLParser } from "@lib/xml/parser";
import { ElementAssembler } from "@lib/xsd/pipeline/elementAssembler";
import { Pipeline, PipelineImpl } from "@lib/xsd/pipeline/pipeline";
import { ParseAttributesStep } from "@lib/xsd/pipeline/steps/attributes";
import { ParseEnumerationStep } from "@lib/xsd/pipeline/steps/enumeration";
import { ParseExtensionStep } from "@lib/xsd/pipeline/steps/extension";
import { ParseNestedElementsStep } from "@lib/xsd/pipeline/steps/nestedElement";
import { ParseRestrictionsStep } from "@lib/xsd/pipeline/steps/restriction";
import { ParseRootElementStep } from "@lib/xsd/pipeline/steps/rootElement";
import { ParseSimpleContentStep } from "@lib/xsd/pipeline/steps/simpleContent";
import { ParseListStep } from "@lib/xsd/pipeline/steps/list";
import { ModularTypeReferenceResolver } from "@lib/xsd/resolvers/ModularTypeReferenceResolver";
import { DocumentExtractor } from "@lib/xsd/utils/documentExtractor";
export interface XSDParser {
  parse(xsd: string): XSDSchema;
}

export class XSDPipelineParserImpl implements XSDParser {
  private pipeline: Pipeline<Element, Partial<XSDElement>>;
  private assembler: ElementAssembler;

  constructor(private xmlParser: XMLParser) {
    this.pipeline = new PipelineImpl<Element, Partial<XSDElement>>()
      .addStep(new ParseRootElementStep())
      .addStep(new ParseEnumerationStep())
      .addStep(new ParseAttributesStep())
      .addStep(new ParseNestedElementsStep())
      .addStep(new ParseRestrictionsStep())
      .addStep(new ParseExtensionStep())
      .addStep(new ParseSimpleContentStep())
      .addStep(new ParseListStep());
    this.assembler = new ElementAssembler();
  }

  parse(xsd: string): XSDSchema {
    const extractor = new DocumentExtractor(this.xmlParser);
    const doc = extractor.parseDocument(xsd);

    if (!doc.documentElement) {
      throw new Error("Invalid XML: No document element found.");
    }

    const schemaNodes = extractor.extractTopLevelSchemaNodes(doc.documentElement);

    // Separate global elements and global complexTypes.
    const elementNodes = schemaNodes.filter((node) => node.localName === "element");
    const complexTypeNodes = schemaNodes.filter((node) => node.localName === "complexType");
    const simpleTypeNodes = schemaNodes.filter((node) => node.localName === "simpleType");

    // Process global elements via your pipeline.
    const elementPartials = elementNodes.map((el) => this.pipeline.execute(el));
    const elementsMerged = this.assembler.mergePartialElements(elementPartials);
    const validElements = this.assembler.filterValidElements(elementsMerged);

    // Process global complexTypes using the same pipeline (or a similar one)
    // so that we capture the definitions. Assume they share similar structure.
    const typePartials = complexTypeNodes.map((el) => this.pipeline.execute(el));
    const typesMerged = this.assembler.mergePartialElements(typePartials);
    // Create a map keyed by name (if available)
    const typesMap: { [key: string]: XSDElement } = {};
    typesMerged
      .filter((t): t is XSDElement => t.name !== undefined)
      .forEach((typeDef) => {
        typesMap[typeDef.name] = typeDef;
      });

    // Process global simpleTypes — pipeline resolves their restriction/facets.
    const simpleTypePartials = simpleTypeNodes.map((el) => this.pipeline.execute(el));
    const simpleTypesMerged = this.assembler.mergePartialElements(simpleTypePartials);
    simpleTypesMerged
      .filter((t): t is XSDElement => t.name !== undefined)
      .forEach((typeDef) => {
        typesMap[typeDef.name] = typeDef;
      });

    const targetNamespace = doc.documentElement.getAttribute("targetNamespace") || undefined;
    const namespacedElements = targetNamespace
      ? this.assembler.applyNamespace(validElements, targetNamespace)
      : validElements;

    const schema: XSDSchema = { targetNamespace, elements: namespacedElements, types: typesMap };

    // Resolve type references now that we have global types available.
    const resolver = new ModularTypeReferenceResolver(schema);
    const resolvedElements = resolver.resolve();

    return { targetNamespace, elements: resolvedElements, types: typesMap };
  }
}
