import { XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

export class ParseRestrictionsStep implements PipelineStep<Element, Partial<XSDElement>> {
    execute(el: Element): Partial<XSDElement> {
        const simpleType = el.getElementsByTagName("xs:simpleType")[0];
        if (!simpleType) return {};

        const restriction = simpleType.getElementsByTagName("xs:restriction")[0];
        if (!restriction) return {};

        const result: Partial<XSDElement> = {};

        const baseType = restriction.getAttribute("base");
        if (baseType && baseType.startsWith("xs:")) {
            result.type = baseType;
        }

        const enumNodes = restriction.getElementsByTagName("xs:enumeration");
        const enumeration = Array.from(enumNodes).map(
            (enumNode) => enumNode.getAttribute("value") || ""
        );
        if (enumeration.length > 0) {
            result.enumeration = enumeration;
        }

        const patternEl = restriction.getElementsByTagName("xs:pattern")[0];
        if (patternEl) {
            const regex = patternEl.getAttribute("value");
            if (regex) {
                result.pattern = regex;
            }
        }

        const minLenEl = restriction.getElementsByTagName("xs:minLength")[0];
        if (minLenEl) {
            const val = parseInt(minLenEl.getAttribute("value") || "", 10);
            if (!isNaN(val)) {
                result.minLength = val;
            }
        }

        const maxLenEl = restriction.getElementsByTagName("xs:maxLength")[0];
        if (maxLenEl) {
            const val = parseInt(maxLenEl.getAttribute("value") || "", 10);
            if (!isNaN(val)) {
                result.maxLength = val;
            }
        }

        return result;
    }
}
