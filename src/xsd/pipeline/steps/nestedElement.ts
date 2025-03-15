import { XSDElement, XSDChoice } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

export class ParseNestedElementsStep implements PipelineStep<Element, Partial<XSDElement>> {
  // Use the official XSD namespace (fixed by standard)
  private readonly XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

  execute(el: Element): Partial<XSDElement> {
    let result = { children: [] as XSDElement[], choices: [] as XSDChoice[] };

    // If it's a complexType, parse its children
    if (this.isXsdElement(el, "complexType")) {
      const res = this.parseContainer(el, false);
      result.children.push(...res.children);
      if (res.choices.length > 0) {
        result.choices.push(...res.choices);
      }
    } else {
      // Else look for complexType children inside (for root/schema element cases)
      const complexTypes = Array.from(el.childNodes)
        .filter(node => this.isXsdElement(node as Element, "complexType"))
        .map(node => node as Element);

      complexTypes.forEach(ct => {
        const res = this.parseContainer(ct, false);
        result.children.push(...res.children);
        if (res.choices.length > 0) {
          result.choices.push(...res.choices);
        }
      });
    }

    return result;
  }

  /**
   * Recursively parse a container node (complexType, sequence, or choice).
   */
  private parseContainer(el: Element, isInChoice: boolean = false): { children: XSDElement[], choices: XSDChoice[] } {
    let children: XSDElement[] = [];
    let choices: XSDChoice[] = [];

    Array.from(el.childNodes).forEach(node => {
      if (node.nodeType !== 1) return; // skip non-elements
      const child = node as Element;

      if (this.isXsdElement(child, "element")) {
        children.push(this.parseElement(child, isInChoice) as XSDElement);
      } else if (this.isXsdElement(child, "sequence")) {
        const res = this.parseContainer(child, false);
        children.push(...res.children);
        choices.push(...res.choices);
      } else if (this.isXsdElement(child, "choice")) {
        const res = this.parseContainer(child, true);
        if (res.children.length > 0) {
          choices.push({ elements: res.children });
        }
        choices.push(...res.choices);
      }
    });

    return { children, choices };
  }

  /**
   * Parse an <element> tag into XSDElement object, handling min/maxOccurs and inline complexType.
   */
  private parseElement(el: Element, isInChoice: boolean = false): XSDElement | null {
    const name = el.getAttribute("name");
    if (!name) return null;

    const minOccursAttr = el.getAttribute("minOccurs");
    const minOccurs = parseInt(minOccursAttr && minOccursAttr.trim() !== "" ? minOccursAttr : "1", 10);
    const effectiveMinOccurs = isInChoice && (!minOccursAttr || minOccursAttr.trim() === "") ? 0 : minOccurs;

    const maxOccursAttr = el.getAttribute("maxOccurs");
    const maxOccurs = maxOccursAttr === "unbounded"
      ? "unbounded"
      : parseInt(maxOccursAttr && maxOccursAttr.trim() !== "" ? maxOccursAttr : "1", 10);

    const xsdElement: XSDElement = { name, minOccurs: effectiveMinOccurs, maxOccurs };

    // Capture the type attribute if present.
    const typeAttr = el.getAttribute("type");
    if (typeAttr) {
      xsdElement.type = typeAttr;
    }

    // Handle inline complexType (if present)
    const inlineComplexType = Array.from(el.childNodes)
      .filter(n => this.isXsdElement(n as Element, "complexType"))
      .map(n => n as Element)[0];
    if (inlineComplexType) {
      const res = this.parseContainer(inlineComplexType, false);
      if (res.children.length > 0) xsdElement.children = res.children;
      if (res.choices.length > 0) xsdElement.choices = res.choices;
    }
    return xsdElement;
  }


  /**
   * Helper to check if an element belongs to the XSD namespace.
   */
  private isXsdElement(el: Element, name: string): boolean {
    return el.localName === name && el.namespaceURI === this.XSD_NAMESPACE;
  }
}
