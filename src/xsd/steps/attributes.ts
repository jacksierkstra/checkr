import { XSDAttribute, XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/steps/pipeline";

export class ParseAttributesStep implements PipelineStep<Element, Partial<XSDElement>> {
    execute(el: Element): Partial<XSDElement> {
        const attributes: XSDAttribute[] = Array.from(el.getElementsByTagName("xs:attribute")).map((attr) => ({
            name: attr.getAttribute("name")!,
            type: attr.getAttribute("type") || "xs:string",
            use: (attr.getAttribute("use") as "required" | "optional") || "optional",
            fixed: attr.getAttribute("fixed") || undefined,
        }));
        return { attributes };
    }
}
