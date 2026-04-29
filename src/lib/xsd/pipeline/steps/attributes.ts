import { XSDAttribute, XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseAttributesStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    const attributes: XSDAttribute[] = Array.from(
      el.getElementsByTagNameNS(XSD_NAMESPACE, "attribute"),
    ).flatMap((attr): XSDAttribute[] => {
      const name = attr.getAttribute("name");
      const ref = attr.getAttribute("ref");

      if (name === null && ref === null) return [];

      if (name === null && ref !== null) {
        // ref-based attribute: use local name of ref as placeholder name
        const localName = ref.replace(/^.*:/, "");
        return [{ name: localName, ref: localName, use: "optional" as const }];
      }

      return [{
        name: name!,
        type: attr.getAttribute("type") || "xs:string",
        use: (attr.getAttribute("use") as "required" | "optional") || "optional",
        fixed: attr.getAttribute("fixed") || undefined,
      }];
    });

    const anyAttr = el.getElementsByTagNameNS(XSD_NAMESPACE, "anyAttribute")[0];
    const result: Partial<XSDElement> = { attributes };
    if (anyAttr) result.allowAnyAttribute = true;
    return result;
  }
}
