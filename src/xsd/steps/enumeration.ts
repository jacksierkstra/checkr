import { XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/steps/pipeline";

export class ParseEnumerationStep implements PipelineStep<Element, Partial<XSDElement>> {
    execute(el: Element): Partial<XSDElement> {
        const simpleType = el.getElementsByTagName("xs:simpleType")[0];
        if (!simpleType) return {};

        const restriction = simpleType.getElementsByTagName("xs:restriction")[0];
        if (!restriction) return {};

        const enumNodes = restriction.getElementsByTagName("xs:enumeration");
        const enumeration = Array.from(enumNodes).map(
            (enumNode) => enumNode.getAttribute("value") || ""
        );
        return enumeration.length > 0 ? { enumeration } : {};
    }
}