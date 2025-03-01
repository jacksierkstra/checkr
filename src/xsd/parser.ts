import { XSDAttribute, XSDSchema, XSDElement } from '@lib/types/xsd';
import { XMLParser } from '@lib/xml/parser';

export interface XSDParser {
  parse(xsd: string): Promise<XSDSchema>;
}

export class XSDParserImpl implements XSDParser {
  constructor(private xmlParser: XMLParser) {}

  async parse(xsd: string): Promise<XSDSchema> {
    const doc = this.xmlParser.parse(xsd);

    // Ensure documentElement is valid
    if (!doc.documentElement || doc.documentElement.tagName !== "xs:schema") {
      throw new Error("Invalid XSD: Missing root <xs:schema>");
    }

    return {
      targetNamespace: doc.documentElement.getAttribute("targetNamespace") || undefined,
      elements: Array.from(doc.documentElement.childNodes) // Use childNodes instead of children
        .filter((node) => node.nodeType === 1 && node.nodeName === "xs:element") // Ensure it's an element node
        .map((el) => this.parseElement(el as Element))
        .filter((element): element is XSDElement => element !== null),
    };
  }

  private parseElement = (el: Element): XSDElement | null => {
    const name = el.getAttribute("name");
    if (!name) return null;

    return {
      name,
      type: el.getAttribute("type") || undefined,
      minOccurs: parseInt(el.getAttribute("minOccurs") || "0", 10),
      maxOccurs: el.getAttribute("maxOccurs") === "unbounded"
        ? NaN // Handle "unbounded" case
        : parseInt(el.getAttribute("maxOccurs") || "1", 10),
      attributes: this.parseAttributes(el),
      children: this.parseNestedElements(el),
    };
  };

  private parseAttributes = (el: Element): XSDAttribute[] =>
    Array.from(el.getElementsByTagName("xs:attribute")).map((attr) => ({
      name: attr.getAttribute("name")!,
      type: attr.getAttribute("type") || "xs:string",
      use: (attr.getAttribute("use") as "required" | "optional") || "optional",
      fixed: attr.getAttribute("fixed") || undefined,
    }));

  private parseNestedElements = (el: Element): XSDElement[] =>
    Array.from(el.getElementsByTagName("xs:complexType"))
      .flatMap((complexType) =>
        Array.from(complexType.getElementsByTagName("xs:sequence")).flatMap((sequence) =>
          Array.from(sequence.childNodes)
            .filter((child) => child.nodeType === 1 && child.nodeName === "xs:element") // Ensure it's an element node
            .map((child) => this.parseElement(child as Element))
        )
      )
      .filter((child): child is XSDElement => child !== null);
}
