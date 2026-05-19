import { DOMParser as XmldomDOMParser } from "@xmldom/xmldom";
import { XMLDocument } from "@lib/types/xml.js";

export interface XMLParser {
  parse(xml: string): XMLDocument;
}

type DOMParserLike = {
  parseFromString(xml: string, mimeType: string): Document;
};

export class XMLParserImpl implements XMLParser {
  parse(xml: string): XMLDocument {
    const parser = this.createDomParser();
    const doc = parser.parseFromString(xml.trim(), "application/xml");

    if (typeof globalThis.DOMParser === "function") {
      const parseError = doc.getElementsByTagName("parsererror")[0];
      if (parseError) {
        throw new Error(parseError.textContent ?? "XML parse error");
      }
    }

    return doc;
  }

  private createDomParser(): DOMParserLike {
    if (typeof globalThis.DOMParser === "function") {
      return new globalThis.DOMParser();
    }

    return new XmldomDOMParser({
      onError: (_level, message) => {
        throw new Error(message);
      },
    }) as unknown as DOMParserLike;
  }
}
