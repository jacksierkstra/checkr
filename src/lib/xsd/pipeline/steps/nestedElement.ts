import { XSDElement, XSDChoice } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseNestedElementsStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    let result = { children: [] as XSDElement[], choices: [] as XSDChoice[], allowAnyChild: false };

    if (this.isXsdElement(el, "complexType")) {
      const res = this.parseContainer(el, false);
      result.children.push(...res.children);
      if (res.choices.length > 0) {
        result.choices.push(...res.choices);
      }
      if (res.allowAnyChild) result.allowAnyChild = true;
    } else {
      const complexTypes = Array.from(el.childNodes)
        .filter((node) => {
          const element = node as Element;
          return element.nodeType === 1 && this.isXsdElement(element, "complexType");
        })
        .map((node) => node as Element);

      complexTypes.forEach((ct) => {
        const res = this.parseContainer(ct, false);
        result.children.push(...res.children);
        if (res.choices.length > 0) {
          result.choices.push(...res.choices);
        }
        if (res.allowAnyChild) result.allowAnyChild = true;
      });
    }

    return result.allowAnyChild
      ? { children: result.children, choices: result.choices, allowAnyChild: true }
      : { children: result.children, choices: result.choices };
  }

  private parseContainer(
    el: Element,
    isInChoice: boolean = false,
  ): { children: XSDElement[]; choices: XSDChoice[]; allowAnyChild: boolean } {
    let children: XSDElement[] = [];
    let choices: XSDChoice[] = [];
    let allowAnyChild = false;

    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType !== 1) return;
      const child = node as Element;

      if (this.isXsdElement(child, "element")) {
        const element = this.parseElement(child, isInChoice);
        if (element) {
          children.push(element);
        }
      } else if (this.isXsdElement(child, "sequence")) {
        const res = this.parseContainer(child, false);
        children.push(...res.children);
        choices.push(...res.choices);
        if (res.allowAnyChild) allowAnyChild = true;
      } else if (this.isXsdElement(child, "choice")) {
        const res = this.parseContainer(child, true);
        if (res.children.length > 0) {
          choices.push({ elements: res.children });
        }
        choices.push(...res.choices);
        if (res.allowAnyChild) allowAnyChild = true;
      } else if (this.isXsdElement(child, "all")) {
        const res = this.parseContainer(child, false);
        // Tag all children as order-independent
        children.push(...res.children.map((c) => ({ ...c, inAll: true })));
        choices.push(...res.choices);
        if (res.allowAnyChild) allowAnyChild = true;
      } else if (this.isXsdElement(child, "any")) {
        allowAnyChild = true;
      }
    });

    return { children, choices, allowAnyChild };
  }

  private parseElement(el: Element, isInChoice: boolean = false): XSDElement | null {
    const name = el.getAttribute("name");
    if (!name) return null;

    const minOccursAttr = el.getAttribute("minOccurs");
    const minOccurs = parseInt(
      minOccursAttr && minOccursAttr.trim() !== "" ? minOccursAttr : "1",
      10,
    );
    const effectiveMinOccurs =
      isInChoice && (!minOccursAttr || minOccursAttr.trim() === "") ? 0 : minOccurs;

    const maxOccursAttr = el.getAttribute("maxOccurs");
    const maxOccurs =
      maxOccursAttr === "unbounded"
        ? "unbounded"
        : parseInt(maxOccursAttr && maxOccursAttr.trim() !== "" ? maxOccursAttr : "1", 10);

    const xsdElement: XSDElement = { name, minOccurs: effectiveMinOccurs, maxOccurs };

    const typeAttr = el.getAttribute("type");
    if (typeAttr) {
      xsdElement.type = typeAttr;
    }

    const defaultAttr = el.getAttribute("default");
    if (defaultAttr !== null) xsdElement.default = defaultAttr;

    const fixedAttr = el.getAttribute("fixed");
    if (fixedAttr !== null) xsdElement.fixed = fixedAttr;

    const inlineComplexType = Array.from(el.childNodes)
      .filter((n) => this.isXsdElement(n as Element, "complexType"))
      .map((n) => n as Element)[0];
    if (inlineComplexType) {
      const res = this.parseContainer(inlineComplexType, false);
      if (res.children.length > 0) xsdElement.children = res.children;
      if (res.choices.length > 0) xsdElement.choices = res.choices;
    }
    return xsdElement;
  }

  private isXsdElement(el: Element, name: string): boolean {
    return el.localName === name && el.namespaceURI === XSD_NAMESPACE;
  }
}
