import { XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseUnionStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    let simpleType = el.getElementsByTagNameNS(XSD_NAMESPACE, "simpleType")[0] as Element;
    if (!simpleType) {
      simpleType = el.getElementsByTagName("xs:simpleType")[0] as Element;
    }
    if (!simpleType) return {};

    let unionEl = simpleType.getElementsByTagNameNS(XSD_NAMESPACE, "union")[0] as Element;
    if (!unionEl) {
      unionEl = simpleType.getElementsByTagName("xs:union")[0] as Element;
    }
    if (!unionEl) return {};

    const memberTypes = unionEl.getAttribute("memberTypes");
    if (!memberTypes) return {};

    const types = memberTypes.trim().split(/\s+/).filter(Boolean);
    if (types.length === 0) return {};

    return { unionMemberTypes: types };
  }
}
