import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { XMLParser } from "@lib/xml/parser";
import { Pipeline, PipelineImpl } from "@lib/xsd/pipeline/pipeline";
import { ParseAttributesStep } from "@lib/xsd/pipeline/steps/attributes";
import { ParseEnumerationStep } from "@lib/xsd/pipeline/steps/enumeration";
import { ParseNestedElementsStep } from "@lib/xsd/pipeline/steps/nestedElement";
import { ParseRestrictionsStep } from "@lib/xsd/pipeline/steps/restriction";
import { ParseRootElementStep } from "@lib/xsd/pipeline/steps/rootElement";
import { ParseTypeReferencesStep } from "@lib/xsd/pipeline/steps/typeReferences";

export interface XSDParser {
    parse(xsd: string): Promise<XSDSchema>;
}

export class XSDPipelineParserImpl implements XSDParser {
    private pipeline: Pipeline<Element, Partial<XSDElement>>;

    constructor(private xmlParser: XMLParser) {
        this.pipeline = new PipelineImpl<Element, Partial<XSDElement>>()
            .addStep(new ParseRootElementStep())
            .addStep(new ParseEnumerationStep())
            .addStep(new ParseAttributesStep())
            .addStep(new ParseNestedElementsStep())
            .addStep(new ParseRestrictionsStep());
    }

    async parse(xsd: string): Promise<XSDSchema> {
        const doc = this.xmlParser.parse(xsd);
    
        const schemaNodes = this.extractTopLevelSchemaNodes(doc.documentElement);
        const partialObjects = this.mapElementNodesToPartialXSDElementObjects(schemaNodes);
        const xsdElements = this.mergePartialXSDElementObjects(partialObjects);
        const filteredElements = this.filterValidXSDElementObjects(xsdElements);
    
        const targetNamespace = doc.documentElement.getAttribute("targetNamespace") || undefined;
    
        const schema: XSDSchema = { targetNamespace, elements: filteredElements };
        const resolvedElements = this.resolveTypeReferences(schema);
    
        return { targetNamespace, elements: resolvedElements };
    }


    private mapElementNodesToPartialXSDElementObjects(elementNodes: Element[]): Partial<XSDElement>[][] {
        return elementNodes.map((el) => this.pipeline.execute(el));
    }

    private mergePartialXSDElementObjects(partialXSDElementObjects: Partial<XSDElement>[][]): XSDElement[] {
        return partialXSDElementObjects.map((partials) => {
            const merged = partials.reduce((acc, partial) => ({ ...acc, ...partial }), {} as XSDElement);
            return merged as XSDElement; // Explicitly cast to XSDElement
        });
    }

    private filterValidXSDElementObjects(xsdElements: XSDElement[]): XSDElement[] {
        return xsdElements.filter((element): element is XSDElement => !!element.name);
    }

    private resolveTypeReferences(schema: XSDSchema): XSDElement[] {
        const resolver = new ParseTypeReferencesStep(schema);
        return schema.elements.map(el => resolver.execute(el));
    }

    private extractTopLevelSchemaNodes(documentElement: Element): Element[] {
        return Array.from(documentElement.childNodes)
            .filter((node) => 
                node.nodeType === 1 && 
                (this.isElement(node, "element") || this.isElement(node, "complexType"))
            ) as Element[];
    }
    
    private isElement(node: Node, localName: string): boolean {
        return node.nodeType === 1 && (node as Element).localName === localName;
    }
    
    
}