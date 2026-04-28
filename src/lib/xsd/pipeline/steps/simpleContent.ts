import { XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";
import { ParseAttributesStep } from "./attributes";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseSimpleContentStep implements PipelineStep<Element, Partial<XSDElement>> {
  private attributeParser = new ParseAttributesStep();

  execute(el: Element): Partial<XSDElement> {
    const complexType = el.getElementsByTagNameNS(XSD_NAMESPACE, "complexType")[0];
    if (!complexType) return {};

    const simpleContent = complexType.getElementsByTagNameNS(XSD_NAMESPACE, "simpleContent")[0];
    if (!simpleContent) return {};

    const extension = simpleContent.getElementsByTagNameNS(XSD_NAMESPACE, "extension")[0];
    if (extension) {
      return this.parseExtension(extension);
    }

    const restriction = simpleContent.getElementsByTagNameNS(XSD_NAMESPACE, "restriction")[0];
    if (restriction) {
      return this.parseRestriction(restriction);
    }

    return {};
  }

  private parseExtension(extension: Element): Partial<XSDElement> {
    const base = extension.getAttribute("base");
    if (!base) return {};

    const result: Partial<XSDElement> = {};

    // If base is a built-in xs: type, set it as the element type directly
    if (base.startsWith("xs:")) {
      result.type = base;
    }

    // Extract attributes from the extension
    const attrsResult = this.attributeParser.execute(extension);
    if (attrsResult.attributes && attrsResult.attributes.length > 0) {
      result.attributes = attrsResult.attributes.map((attr) => {
        const attrEl = Array.from(
          extension.getElementsByTagNameNS(XSD_NAMESPACE, "attribute"),
        ).find((a) => a.getAttribute("name") === attr.name);
        if (attrEl) {
          const fixed = attrEl.getAttribute("fixed");
          const defaultVal = attrEl.getAttribute("default");
          return {
            ...attr,
            ...(fixed != null ? { fixed } : {}),
            ...(defaultVal != null ? { default: defaultVal } : {}),
          };
        }
        return attr;
      });
    }

    return result;
  }

  private parseRestriction(restriction: Element): Partial<XSDElement> {
    const base = restriction.getAttribute("base");
    if (!base) return {};

    const result: Partial<XSDElement> = {};

    if (base.startsWith("xs:")) {
      result.type = base;
    }

    // Extract attributes defined in the restriction
    const attrsResult = this.attributeParser.execute(restriction);
    if (attrsResult.attributes && attrsResult.attributes.length > 0) {
      result.attributes = attrsResult.attributes;
    }

    return result;
  }
}
