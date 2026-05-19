import { XSDElement } from "@lib/types/xsd.js";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline.js";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseEnumerationStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    const simpleType = el.getElementsByTagNameNS(XSD_NAMESPACE, "simpleType")[0];
    if (!simpleType) return {};

    const restriction = simpleType.getElementsByTagNameNS(XSD_NAMESPACE, "restriction")[0];
    if (!restriction) return {};

    const enumNodes = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "enumeration");
    const enumeration = Array.from(enumNodes).map(
      (enumNode) => enumNode.getAttribute("value") || "",
    );
    return enumeration.length > 0 ? { enumeration } : {};
  }
}
