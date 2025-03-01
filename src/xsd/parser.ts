import { XSDAttribute, XSDSchema, XSDElement } from '@lib/types/xsd';
import { XMLParser } from '@lib/xml/parser';

export interface XSDParser {
  parse(xsd: string): Promise<XSDSchema>;
}

export class XSDParserImpl implements XSDParser {
  constructor(private xmlParser: XMLParser) {}

  async parse(xsd: string): Promise<XSDSchema> {
    const doc = this.xmlParser.parse(xsd);

    return {
      targetNamespace: doc.documentElement.getAttribute('targetNamespace') || undefined,
      elements: Array.from(doc.getElementsByTagName('xs:element'))
        .map(this.parseElement)
        .filter((element): element is XSDElement => element !== null),
    };
  }

  private parseElement = (el: Element): XSDElement | null => {
    const name = el.getAttribute('name');
    if (!name) return null;

    return {
      name,
      type: el.getAttribute('type') || undefined,
      minOccurs: parseInt(el.getAttribute('minOccurs') || '0', 10),
      maxOccurs: parseInt(el.getAttribute('maxOccurs') || '1', 10),
      attributes: this.parseAttributes(el),
    };
  };

  private parseAttributes = (el: Element): XSDAttribute[] =>
    Array.from(el.getElementsByTagName('xs:attribute')).map((attr) => ({
      name: attr.getAttribute('name')!,
      type: attr.getAttribute('type') || 'xs:string',
      use: (attr.getAttribute('use') as 'required' | 'optional') || 'optional',
      fixed: attr.getAttribute('fixed') || undefined,
    }));
}
