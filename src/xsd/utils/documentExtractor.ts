import { XMLParser } from "@lib/xml/parser";

export class DocumentExtractor {
  constructor(private xmlParser: XMLParser) {}

  /**
   * Parses the provided XSD string into an XML Document.
   */
  parseDocument(xsd: string): Document {
    return this.xmlParser.parse(xsd);
  }

  /**
   * Extracts top-level schema nodes (elements or complex types) from the document's root element.
   */
  extractTopLevelSchemaNodes(documentElement: Element): Element[] {
    const xsdNamespace = "http://www.w3.org/2001/XMLSchema";
    return Array.from(documentElement.childNodes).filter((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node as Element;
      return (
        el.namespaceURI === xsdNamespace &&
        (el.localName === "element" || el.localName === "complexType")
      );
    }) as Element[];
  }
}
