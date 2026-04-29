import { XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

export class ParseRootElementStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    const name = el.getAttribute("name");
    const type = el.getAttribute("type") || undefined;
    const minOccurs = this.parseMinOccurs(el);
    const maxOccurs = this.parseMaxOccurs(el);
    const nillable = el.getAttribute("nillable") === "true" ? true : undefined;
    const defaultVal = el.getAttribute("default");
    const fixedVal = el.getAttribute("fixed");
    const substitutionGroup = el.getAttribute("substitutionGroup") || undefined;

    const result: Partial<XSDElement> = name !== null ? { name, type, minOccurs, maxOccurs, nillable } : {};
    if (defaultVal !== null) result.default = defaultVal;
    if (fixedVal !== null) result.fixed = fixedVal;
    if (substitutionGroup) result.substitutionGroup = substitutionGroup;
    return result;
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
