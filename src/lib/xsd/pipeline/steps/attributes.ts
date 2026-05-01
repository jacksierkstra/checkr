import { XSDAttribute, XSDElement } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";
import { parseRestrictionFacets } from "./facetParser";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

const directChildElements = (node: Element): Element[] =>
  Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1);

export class ParseAttributesStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    const { attributes, allowAnyAttribute, anyAttributeProcessContents, anyAttributeNamespace } = this.parseAttributeContainer(el);
    const result: Partial<XSDElement> = { attributes };
    if (allowAnyAttribute) {
      result.allowAnyAttribute = true;
      if (anyAttributeProcessContents) result.anyAttributeProcessContents = anyAttributeProcessContents;
      if (anyAttributeNamespace) result.anyAttributeNamespace = anyAttributeNamespace;
    }
    return result;
  }

  private parseAttributeContainer(container: Element): {
    attributes: XSDAttribute[];
    allowAnyAttribute: boolean;
    anyAttributeProcessContents?: "strict" | "lax" | "skip";
    anyAttributeNamespace?: string;
  } {
    const attributes: XSDAttribute[] = [];
    let allowAnyAttribute = false;
    let anyAttributeProcessContents: "strict" | "lax" | "skip" | undefined;
    let anyAttributeNamespace: string | undefined;

    for (const child of directChildElements(container)) {
      if (!this.isXsdElement(child)) continue;

      switch (child.localName) {
        case "attribute": {
          const parsed = this.parseAttribute(child);
          if (parsed) attributes.push(parsed);
          break;
        }
        case "attributeGroup": {
          const ref = child.getAttribute("ref");
          if (ref) {
            const localName = ref.replace(/^.*:/, "");
            attributes.push({
              name: localName,
              attributeGroupRef: localName,
              use: "optional",
            });
          }
          break;
        }
        case "anyAttribute": {
          allowAnyAttribute = true;
          const pc = child.getAttribute("processContents");
          if (pc === "strict" || pc === "lax" || pc === "skip") {
            anyAttributeProcessContents = pc;
          }
          const ns = child.getAttribute("namespace");
          if (ns && ns !== "##any") {
            anyAttributeNamespace = ns;
          }
          break;
        }
        case "simpleContent":
        case "complexContent": {
          const extension = directChildElements(child).find(
            (n) => this.isXsdElement(n) && n.localName === "extension",
          );
          const restriction = directChildElements(child).find(
            (n) => this.isXsdElement(n) && n.localName === "restriction",
          );
          const content = extension || restriction;
          if (content) {
            const nested = this.parseAttributeContainer(content);
            attributes.push(...nested.attributes);
            if (nested.allowAnyAttribute) { allowAnyAttribute = true; anyAttributeProcessContents = nested.anyAttributeProcessContents; anyAttributeNamespace = nested.anyAttributeNamespace; }
          }
          break;
        }
        case "complexType": {
          const nested = this.parseAttributeContainer(child);
          attributes.push(...nested.attributes);
          if (nested.allowAnyAttribute) { allowAnyAttribute = true; anyAttributeProcessContents = nested.anyAttributeProcessContents; anyAttributeNamespace = nested.anyAttributeNamespace; }
          break;
        }
        case "extension":
        case "restriction": {
          const nested = this.parseAttributeContainer(child);
          attributes.push(...nested.attributes);
          if (nested.allowAnyAttribute) { allowAnyAttribute = true; anyAttributeProcessContents = nested.anyAttributeProcessContents; anyAttributeNamespace = nested.anyAttributeNamespace; }
          break;
        }
      }
    }

    return { attributes, allowAnyAttribute, anyAttributeProcessContents, anyAttributeNamespace };
  }

  parseAttribute(attr: Element): XSDAttribute | null {
    const name = attr.getAttribute("name");
    const ref = attr.getAttribute("ref");

    if (name === null && ref === null) return null;

    if (name === null && ref !== null) {
      const localName = ref.replace(/^.*:/, "");
      const useAttr = attr.getAttribute("use");
      const refAttr: XSDAttribute = { name: localName, ref: localName };
      if (useAttr) refAttr.use = useAttr as "required" | "optional" | "prohibited";
      return refAttr;
    }

    const result: XSDAttribute = {
      name: name!,
      type: attr.getAttribute("type") || "xs:string",
      use: (attr.getAttribute("use") as "required" | "optional" | "prohibited") || "optional",
      fixed: attr.getAttribute("fixed") || undefined,
      form: this.parseForm(attr),
    };

    const simpleType = directChildElements(attr).find((child) => this.isXsdElement(child) && child.localName === "simpleType");
    if (simpleType) {
      const restriction = directChildElements(simpleType).find(
        (child) => this.isXsdElement(child) && child.localName === "restriction",
      );
      if (restriction) {
        const base = restriction.getAttribute("base");
        if (base) {
          result.type = base;
        }
        Object.assign(result, parseRestrictionFacets(restriction));
      }
    }

    return result;
  }

  private parseForm(attr: Element): "qualified" | "unqualified" | undefined {
    const form = attr.getAttribute("form");
    if (form === "qualified" || form === "unqualified") return form;
    return undefined;
  }

  private isXsdElement(el: Element): boolean {
    return el.namespaceURI === XSD_NAMESPACE;
  }
}
