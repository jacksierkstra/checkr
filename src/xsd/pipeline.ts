import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { XMLParser } from "@lib/xml/parser";
import { ParseAttributesStep } from "@lib/xsd/steps/attributes";
import { ParseEnumerationStep } from "@lib/xsd/steps/enumeration";
import { ParseNestedElementsStep } from "@lib/xsd/steps/nestedElement";
import { Pipeline, PipelineImpl } from "@lib/xsd/steps/pipeline";
import { ParseRestrictionsStep } from "@lib/xsd/steps/restriction";
import { ParseRootElementStep } from "@lib/xsd/steps/rootElement";


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

        const elements: XSDElement[] = Array.from(doc.documentElement.childNodes)
            .filter((node) => node.nodeType === 1 && node.nodeName === "xs:element")
            .map((el) => {
                const partials = this.pipeline.execute(el as Element);
                return partials.reduce((acc, partial) => ({ ...acc, ...partial }), {} as XSDElement);
            })
            .filter((element): element is XSDElement => element.name !== undefined);

        const targetNamespace = doc.documentElement.getAttribute("targetNamespace") || undefined;

        return { targetNamespace, elements };
    }
}
