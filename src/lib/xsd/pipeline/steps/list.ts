import { XSDElement } from "@lib/types/xsd.js";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline.js";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseListStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    let simpleType = el.getElementsByTagNameNS(XSD_NAMESPACE, "simpleType")[0] as Element;
    if (!simpleType) {
      simpleType = el.getElementsByTagName("xs:simpleType")[0] as Element;
    }
    if (!simpleType) return {};

    let listEl = simpleType.getElementsByTagNameNS(XSD_NAMESPACE, "list")[0] as Element;
    if (!listEl) {
      listEl = simpleType.getElementsByTagName("xs:list")[0] as Element;
    }
    if (!listEl) return {};

    const itemType = listEl.getAttribute("itemType");
    if (!itemType) return {};

    return { listItemType: itemType };
  }
}
