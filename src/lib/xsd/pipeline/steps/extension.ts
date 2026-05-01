import { XSDElement, XSDExtension } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";
import { ParseAttributesStep } from "./attributes";

export class ParseExtensionStep implements PipelineStep<Element, Partial<XSDElement>> {
  private attributeParser: ParseAttributesStep;
  private readonly XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

  constructor() {
    this.attributeParser = new ParseAttributesStep();
  }

  execute(el: Element): Partial<XSDElement> {
    const complexType = el.getElementsByTagNameNS(this.XSD_NAMESPACE, "complexType")[0];
    if (!complexType) return {};

    const mixed = complexType.getAttribute("mixed");
    const result: Partial<XSDElement> = {};
    if (mixed === "true") {
      result.mixed = true;
    }

    const abstract = el.getAttribute("abstract");
    if (abstract === "true") {
      result.abstract = true;
    }

    const content = complexType.getElementsByTagNameNS(this.XSD_NAMESPACE, "complexContent")[0];
    if (!content) return result;

    // xs:complexContent mixed= overrides xs:complexType mixed= per XSD 1.0 §3.8.3
    const contentMixed = content.getAttribute("mixed");
    if (contentMixed === "true") {
      result.mixed = true;
    } else if (contentMixed === "false") {
      result.mixed = false;
    }

    const extension = content.getElementsByTagNameNS(this.XSD_NAMESPACE, "extension")[0];
    if (!extension) return result;

    const base = extension.getAttribute("base");
    if (!base) return result;

    const extensionDef: XSDExtension = { base };

    const contentResult = this.parseContentStructure(extension);
    if (contentResult.children && contentResult.children.length > 0) {
      extensionDef.children = contentResult.children;
    }
    if (contentResult.choices && contentResult.choices.length > 0) {
      extensionDef.choices = contentResult.choices;
    }

    const attributesResult = this.attributeParser.execute(extension);
    if (attributesResult.attributes && attributesResult.attributes.length > 0) {
      extensionDef.attributes = attributesResult.attributes.map((attr) => {
        const attribute = { ...attr };
        const attrElements = extension.getElementsByTagNameNS(this.XSD_NAMESPACE, "attribute");
        const matchingAttr = Array.from(attrElements).find(
          (el) => el.getAttribute("name") === attr.name,
        );
        if (matchingAttr) {
          const fixed = matchingAttr.getAttribute("fixed");
          const defaultVal = matchingAttr.getAttribute("default");
          if (fixed) attribute.fixed = fixed;
          if (defaultVal) attribute.default = defaultVal;
        }
        return attribute;
      });
    }

    return { ...result, extension: extensionDef };
  }

  private parseContentStructure(extension: Element): Partial<XSDElement> {
    const result: Partial<XSDElement> = { children: [], choices: [] };
    let allowAnyChild = false;

    Array.from(extension.childNodes).forEach((node) => {
      if (node.nodeType !== 1) return;
      const child = node as Element;

      if (this.isXsdElement(child, "sequence")) {
        const elements = this.parseChildElements(child);
        result.children?.push(...elements);
      } else if (this.isXsdElement(child, "choice")) {
        const elements = this.parseChildElements(child, true);
        if (elements.length > 0) {
          result.choices?.push({ elements });
        }
      } else if (this.isXsdElement(child, "all")) {
        const elements = this.parseChildElements(child);
        result.children?.push(...elements.map((e) => ({ ...e, inAll: true })));
      } else if (this.isXsdElement(child, "group")) {
        const ref = child.getAttribute("ref");
        if (ref) {
          const localRef = ref.replace(/^.*:/, "");
          const minOccursAttr = child.getAttribute("minOccurs");
          const minOccurs = parseInt(
            minOccursAttr && minOccursAttr.trim() !== "" ? minOccursAttr : "1",
            10,
          );
          const maxOccursAttr = child.getAttribute("maxOccurs");
          const maxOccurs =
            maxOccursAttr === "unbounded"
              ? ("unbounded" as const)
              : parseInt(maxOccursAttr && maxOccursAttr.trim() !== "" ? maxOccursAttr : "1", 10);
          result.children?.push({ name: localRef, groupRef: localRef, minOccurs, maxOccurs });
        }
      } else if (this.isXsdElement(child, "any")) {
        allowAnyChild = true;
      }
    });

    if (allowAnyChild) result.allowAnyChild = true;
    return result;
  }

  private parseChildElements(container: Element, inChoice = false) {
    return Array.from(container.childNodes)
      .filter((n) => n.nodeType === 1)
      .map((n) => n as Element)
      .filter((el) => this.isXsdElement(el, "element"))
      .map((el) => {
        const typeAttr = el.getAttribute("type");
        const maxOccursAttr = el.getAttribute("maxOccurs");
        const maxOccurs =
          maxOccursAttr === "unbounded"
            ? ("unbounded" as const)
            : maxOccursAttr
              ? parseInt(maxOccursAttr, 10)
              : 1;
        const form = el.getAttribute("form") as "qualified" | "unqualified" | null;
        return {
          name: el.getAttribute("name") || "",
          type: typeAttr || undefined,
          minOccurs: inChoice ? 0 : parseInt(el.getAttribute("minOccurs") || "1", 10),
          maxOccurs,
          ...(form === "qualified" || form === "unqualified" ? { form } : {}),
        };
      });
  }

  private isXsdElement(el: Element, name: string): boolean {
    return el.localName === name && el.namespaceURI === this.XSD_NAMESPACE;
  }
}
