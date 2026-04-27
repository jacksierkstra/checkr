import { XMLDocument } from "@lib/types/xml";

export interface XMLParser {
  parse(xml: string): XMLDocument;
}

export class XMLParserImpl implements XMLParser {
  parse(xml: string): XMLDocument {
    const doc = new DOMParser().parseFromString(xml.trim(), "application/xml");
    const parseError = doc.getElementsByTagName("parsererror")[0];
    if (parseError) {
      throw new Error(parseError.textContent ?? "XML parse error");
    }
    return doc;
  }
}
