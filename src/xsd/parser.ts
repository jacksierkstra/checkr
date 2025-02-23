import { XSDAll, XSDAttribute, XSDChoice, XSDComplexType, XSDElement, XSDRestriction, XSDSchema, XSDSequence, XSDSimpleType } from '@lib/types/xsd';
import { XMLParserImpl } from '@lib/xml/parser';

export interface XSDParser {
  parseXSD(xsd: string): Promise<any>;
}

export class XSDParserImpl implements XSDParser {

  async parseXSD(xsd: string): Promise<XSDSchema> {
    const xmlParser = new XMLParserImpl();
    const xmlDoc = xmlParser.parse(xsd);
    const schemaElement = this.getSchemaElement(xmlDoc);
    return this.parseSchema(schemaElement);
  }

  private getSchemaElement(xmlDoc: XMLDocument): Element {
    const schemaElement = xmlDoc.documentElement;
    if (!schemaElement || schemaElement.localName !== 'schema' || schemaElement.namespaceURI !== 'http://www.w3.org/2001/XMLSchema') {
      throw new Error('Invalid XSD document: root element must be "schema" from the XMLSchema namespace');
    }
    return schemaElement;
  }

  private parseSchema(schemaElement: Element): XSDSchema {
    const targetNamespace = schemaElement.getAttribute('targetNamespace') || '';
    const elements = this.parseElements(schemaElement);
    const complexTypes = this.parseComplexTypes(schemaElement);
    const simpleTypes = this.parseSimpleTypes(schemaElement);
    const attributes = this.parseAttributes(schemaElement);

    return {
      targetNamespace,
      elements,
      complexTypes,
      simpleTypes,
      attributes,
      // ... parse other XSD elements
    };
  }

  private parseComplexTypes(schemaElement: Element): XSDComplexType[] {
    const complexTypes: XSDComplexType[] = [];
    const complexTypeNodes = schemaElement.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'complexType');

    for (let i = 0; i < complexTypeNodes.length; i++) {
      const complexType = complexTypeNodes[i];
      const name = complexType.getAttribute('name') || '';
      complexTypes.push({ name });
    }

    return complexTypes;
  }

  private parseSimpleTypes(schemaElement: Element): XSDSimpleType[] {
    const simpleTypes: XSDSimpleType[] = [];
    const simpleTypeNodes = schemaElement.getElementsByTagNameNS(
      'http://www.w3.org/2001/XMLSchema',
      'simpleType'
    );

    for (let i = 0; i < simpleTypeNodes.length; i++) {
      const simpleType = simpleTypeNodes[i];
      const name = simpleType.getAttribute('name') || '';
      const restriction = this.parseRestriction(simpleType);
      simpleTypes.push({ name, restriction });
    }

    return simpleTypes;
  }

  private parseAttributes(schemaElement: Element): XSDAttribute[] {
    const attributes: XSDAttribute[] = [];
    const attributeNodes = schemaElement.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'attribute');

    for (let i = 0; i < attributeNodes.length; i++) {
      const attribute = attributeNodes[i];
      const name = attribute.getAttribute('name') || '';
      const type = attribute.getAttribute('type') || '';
      attributes.push({ name, type });
    }

    return attributes;
  }

  private parseRestriction(simpleTypeElement: Element): XSDRestriction | undefined {
    const restrictionElement = simpleTypeElement.getElementsByTagNameNS(
      'http://www.w3.org/2001/XMLSchema',
      'restriction'
    )[0];

    if (!restrictionElement) {
      return undefined;
    }

    const base = restrictionElement.getAttribute('base') || '';
    const enumerations = this.parseEnumerations(restrictionElement);
    const pattern = this.parsePattern(restrictionElement);

    return {
      base,
      enumeration: enumerations && enumerations.length > 0 ? enumerations : undefined,
      pattern: pattern || undefined,
    };
  }

  private parseEnumerations(restrictionElement: Element): string[] {
    const enumerations: string[] = [];
    const enumerationElements = restrictionElement.getElementsByTagNameNS(
      'http://www.w3.org/2001/XMLSchema',
      'enumeration'
    );

    for (let i = 0; i < enumerationElements.length; i++) {
      const enumeration = enumerationElements[i];
      const value = enumeration.getAttribute('value') || '';
      enumerations.push(value);
    }

    return enumerations;
  }

  private parsePattern(restrictionElement: Element): string | undefined {
    const patternElement = restrictionElement.getElementsByTagNameNS(
      'http://www.w3.org/2001/XMLSchema',
      'pattern'
    )[0];
    if (patternElement) {
      return patternElement.getAttribute('value') || undefined;
    }
    return undefined;
  }

  private parseComplexType(complexTypeElement: Element): XSDComplexType {
    const name = complexTypeElement.getAttribute('name') || '';
    const sequence = this.parseSequence(complexTypeElement);
    const choice = this.parseChoice(complexTypeElement);
    const all = this.parseAll(complexTypeElement);
    return { name, sequence, choice, all };
  }

  private parseSequence(complexTypeElement: Element): XSDSequence | undefined {
    const sequenceElement = complexTypeElement.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'sequence')[0];
    if (!sequenceElement) {
      return undefined;
    }
    const elements = this.parseElements(sequenceElement);
    return { elements };
  }

  private parseChoice(complexTypeElement: Element): XSDChoice | undefined {
    const choiceElement = complexTypeElement.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'choice')[0];
    if (!choiceElement) {
      return undefined;
    }
    const elements = this.parseElements(choiceElement);
    return { elements };
  }

  private parseAll(complexTypeElement: Element): XSDAll | undefined {
    const allElement = complexTypeElement.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'all')[0];
    if (!allElement) {
      return undefined;
    }
    const elements = this.parseElements(allElement);
    return { elements };
  }

  private parseElement(elementElement: Element): XSDElement {
    const name = elementElement.getAttribute('name') || '';
    const type = elementElement.getAttribute('type') || '';
    const minOccurs = elementElement.getAttribute('minOccurs') ? parseInt(elementElement.getAttribute('minOccurs') || '1', 10) : undefined;
    const maxOccurs = elementElement.getAttribute('maxOccurs') === 'unbounded' ? 'unbounded' : elementElement.getAttribute('maxOccurs') ? parseInt(elementElement.getAttribute('maxOccurs') || '1', 10) : undefined;
    return { name, type, minOccurs, maxOccurs };
  }

  private parseElements(parentElement: Element): XSDElement[] {
    const elements: XSDElement[] = [];
    const elementNodes = parentElement.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'element');
    for (let i = 0; i < elementNodes.length; i++) {
      elements.push(this.parseElement(elementNodes[i]));
    }
    return elements;
  }

}