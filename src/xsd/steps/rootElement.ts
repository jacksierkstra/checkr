import { XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/steps/pipeline";

export class ParseRootElementStep implements PipelineStep<Element, Partial<XSDElement>> {
    execute(el: Element): Partial<XSDElement> {
        const name = el.getAttribute("name");
        const type = el.getAttribute("type") || undefined;
        const minOccurs = parseInt(el.getAttribute("minOccurs") || "0", 10);
        const maxOccurs = el.getAttribute("maxOccurs") === "unbounded" ? NaN : parseInt(el.getAttribute("maxOccurs") || "1", 10);

        return name ? { name, type, minOccurs, maxOccurs } : {};
    }
}