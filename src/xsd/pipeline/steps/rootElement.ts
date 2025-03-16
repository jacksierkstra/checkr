import { XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";
import { Element } from "@xmldom/xmldom";

export class ParseRootElementStep implements PipelineStep<Element, Partial<XSDElement>> {
    
    execute(el: Element): Partial<XSDElement> {
        const name = el.getAttribute("name");
        const type = el.getAttribute("type") || undefined;
        const minOccurs = this.parseMinOccurs(el);
        const maxOccurs = this.parseMaxOccurs(el);

        return name !== null ? { name, type, minOccurs, maxOccurs } : {};
    }

    parseMaxOccurs(el: Element): number | "unbounded" {
        const maxOccurs = el.getAttribute("maxOccurs");

        if (maxOccurs && maxOccurs !== "unbounded") {
            return parseInt(maxOccurs, 10) || NaN;
        }

        return 1;
    }

    parseMinOccurs(el: Element): number {
        const minOccurs = el.getAttribute("minOccurs");

        if (minOccurs) {
            return parseInt(minOccurs, 10) || 0;
        }

        return 0;
    }
}