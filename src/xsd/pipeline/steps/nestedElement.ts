import { XSDElement, XSDChoice } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

export class ParseNestedElementsStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    let result = { children: [] as XSDElement[], choices: [] as XSDChoice[] };

    // If the provided element is a complexType, process it directly.
    if (el.localName === "complexType") {
      const res = this.parseContainer(el, false);
      result.children.push(...res.children);
      if (res.choices.length > 0) {
        result.choices.push(...res.choices);
      }
    } else {
      // Otherwise, assume it's a container (e.g. the schema element) and process any immediate complexType children.
      const complexTypes = Array.from(el.childNodes)
        .filter(node => node.nodeType === 1 && (node as Element).localName === "complexType")
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
   * The inChoice flag indicates if we're inside a <choice> container.
   */
  private parseContainer(el: Element, isInChoice: boolean = false): { children: XSDElement[], choices: XSDChoice[] } {
    let children: XSDElement[] = [];
    let choices: XSDChoice[] = [];

    Array.from(el.childNodes).forEach(node => {
      if (node.nodeType !== 1) return; // skip non-element nodes
      const child = node as Element;
      if (child.localName === "element") {
        // Pass the flag directly so that elements in a choice default to minOccurs=0.
        children.push(this.parseElement(child, isInChoice) as XSDElement);
      } else if (child.localName === "sequence") {
        const res = this.parseContainer(child, false);
        children.push(...res.children);
        choices.push(...res.choices);
      } else if (child.localName === "choice") {
        const res = this.parseContainer(child, true);
        // Wrap elements from the choice container.
        if (res.children.length > 0) {
          choices.push({ elements: res.children });
        }
        choices.push(...res.choices);
      }
      // Ignore any other nodes (e.g. text nodes)
    });
    return { children, choices };
  }

  /**
   * Parse an xs:element node.
   * If isInChoice is true and no explicit minOccurs is provided, default to 0.
   */
  private parseElement(el: Element, isInChoice: boolean = false): XSDElement | null {
    const name = el.getAttribute("name");
    if (!name) return null;
    let minOccurs = parseInt(el.getAttribute("minOccurs") ?? "1", 10);
    if (isInChoice && !el.hasAttribute("minOccurs")) {
      minOccurs = 0;
    }
    const maxOccursAttr = el.getAttribute("maxOccurs");
    const maxOccurs = maxOccursAttr === "unbounded" 
      ? NaN 
      : parseInt(maxOccursAttr ?? "1", 10);

    const xsdElement: XSDElement = { name, minOccurs, maxOccurs };

    // Check for an inline complexType and, if present, recursively parse it.
    const inlineComplexType = Array.from(el.childNodes)
      .filter(n => n.nodeType === 1 && (n as Element).localName === "complexType")
      .map(n => n as Element)[0];
    if (inlineComplexType) {
      const res = this.parseContainer(inlineComplexType, false);
      if (res.children.length > 0) {
        xsdElement.children = res.children;
      }
      if (res.choices.length > 0) {
        xsdElement.choices = res.choices;
      }
    }
    return xsdElement;
  }
}
