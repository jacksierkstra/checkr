import { XSDParser, XSDParserImpl } from "@lib/xsd/parser";

describe('XSDParserImpl', () => {


    it('should parse a valid XSD document', async () => {
        const xsd = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
                <xs:element name="request" type="xs:string"/>
                <xs:complexType name="MyComplexType"/>
                <xs:simpleType name="MySimpleType"/>
                <xs:attribute name="myAttribute" type="xs:string"/>
            </xs:schema>
        `;
        const parser: XSDParser = new XSDParserImpl();
        const result = await parser.parseXSD(xsd);

        expect(result).toBeDefined();
        expect(result.targetNamespace).toBe('http://example.com/schema');
        expect(result.elements.length).toBe(1);
        expect(result.complexTypes.length).toBe(1);
        expect(result.simpleTypes.length).toBe(1);
        expect(result.attributes.length).toBe(1);
    });

    it('should throw an error for an invalid XSD document (invalid root element)', async () => {
        const xsd = '<invalid-xml></invalid-xml>';
        const parser: XSDParser = new XSDParserImpl();
        await expect(parser.parseXSD(xsd)).rejects.toThrow('Invalid XSD document: root element must be "schema" from the XMLSchema namespace');
    });

    describe('Simple types', () => {
        it('should parse simple types', async () => {
            const xsd = `
              <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
                <xs:simpleType name="MySimpleType">
                  <xs:restriction base="xs:string">
                    <xs:enumeration value="value1"/>
                    <xs:enumeration value="value2"/>
                  </xs:restriction>
                </xs:simpleType>
              </xs:schema>
            `;

            const parser: XSDParser = new XSDParserImpl();
            const result = await parser.parseXSD(xsd);

            expect(result).toBeDefined();
            expect(result.simpleTypes.length).toBe(1);
            expect(result.simpleTypes[0].name).toBe('MySimpleType');
        });
    });

    describe('Complex types', () => {
        it('should parse complex types', async () => {
            const xsd = `
              <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
                <xs:complexType name="MyComplexType">
                  <xs:sequence>
                    <xs:element name="field1" type="xs:string"/>
                    <xs:element name="field2" type="xs:int"/>
                  </xs:sequence>
                </xs:complexType>
              </xs:schema>
            `;

            const parser: XSDParser = new XSDParserImpl();
            const result = await parser.parseXSD(xsd);

            expect(result).toBeDefined();
            expect(result.complexTypes.length).toBe(1);
            expect(result.complexTypes[0].name).toBe('MyComplexType');
        });
    });

    describe('Attributes', () => {
        it('should parse attributes', async () => {
            const xsd = `
              <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
                <xs:attribute name="myAttribute" type="xs:string"/>
              </xs:schema>
            `;

            const parser: XSDParser = new XSDParserImpl();
            const result = await parser.parseXSD(xsd);

            expect(result).toBeDefined();
            expect(result.attributes.length).toBe(1);
            expect(result.attributes[0].name).toBe('myAttribute');
            expect(result.attributes[0].type).toBe('xs:string');
        });
    });

    describe('Empty schemas and edge cases', () => {
        it('should handle empty schemas gracefully', async () => {
            const xsd = `
              <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema"></xs:schema>
            `;

            const parser: XSDParser = new XSDParserImpl();
            const result = await parser.parseXSD(xsd);

            expect(result).toBeDefined();
            expect(result.elements.length).toBe(0);
            expect(result.complexTypes.length).toBe(0);
            expect(result.simpleTypes.length).toBe(0);
            expect(result.attributes.length).toBe(0);
        });

        it('should throw an error for invalid XSD (invalid root element)', async () => {
            const xsd = '<invalid-xml></invalid-xml>';
            const parser: XSDParser = new XSDParserImpl();
            await expect(parser.parseXSD(xsd)).rejects.toThrow('Invalid XSD document: root element must be "schema" from the XMLSchema namespace');
        });

        it('should handle different namespaces', async () => {
            const xsd = `
              <schema xmlns="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
                <element name="request" type="string"/>
              </schema>
            `;

            const parser: XSDParser = new XSDParserImpl();
            const result = await parser.parseXSD(xsd);

            expect(result).toBeDefined();
            expect(result.elements.length).toBe(1);
            expect(result.elements[0].name).toBe('request');
            expect(result.elements[0].type).toBe('string');
        });

        it('should parse elements with minOccurs and maxOccurs', async () => {
            const xsd = `
              <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
                <xs:element name="items" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
              </xs:schema>
            `;

            const parser: XSDParser = new XSDParserImpl();
            const result = await parser.parseXSD(xsd);
            expect(result).toBeDefined();
            expect(result.elements[0].name).toBe('items');
        });

        it('should parse xs:sequence, xs:choice and xs:all within complex types', async () => {
            const xsd = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
              <xs:complexType name="complexType">
                <xs:sequence>
                  <xs:element name="sequenceElement" type="xs:string" />
                </xs:sequence>
                <xs:choice>
                  <xs:element name="choiceElement1" type="xs:string" />
                  <xs:element name="choiceElement2" type="xs:string" />
                </xs:choice>
                <xs:all>
                  <xs:element name="allElement" type="xs:string" />
                </xs:all>
              </xs:complexType>
            </xs:schema>
            `;
            const parser: XSDParser = new XSDParserImpl();
            const result = await parser.parseXSD(xsd);
            expect(result).toBeDefined();
            expect(result.complexTypes[0].name).toBe('complexType');
        });

    });


    it('should parse xs:restriction with enumeration', async () => {
        const xsd = `
          <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
            <xs:simpleType name="MySimpleType">
              <xs:restriction base="xs:string">
                <xs:enumeration value="value1"/>
                <xs:enumeration value="value2"/>
              </xs:restriction>
            </xs:simpleType>
          </xs:schema>
        `;

        const parser: XSDParser = new XSDParserImpl();
        const result = await parser.parseXSD(xsd);

        expect(result).toBeDefined();
        expect(result.simpleTypes[0].restriction).toBeDefined();
        expect(result.simpleTypes[0].restriction?.enumeration).toEqual(['value1', 'value2']);
    });

    it('should parse xs:restriction with pattern', async () => {
        const xsd = `
          <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
            <xs:simpleType name="MySimpleType">
              <xs:restriction base="xs:string">
                <xs:pattern value="[a-zA-Z]+"/>
              </xs:restriction>
            </xs:simpleType>
          </xs:schema>
        `;
        const parser: XSDParser = new XSDParserImpl();
        const result = await parser.parseXSD(xsd);

        expect(result).toBeDefined();
        expect(result.simpleTypes[0].restriction).toBeDefined();
        expect(result.simpleTypes[0].restriction?.pattern).toBe('[a-zA-Z]+');
    });


    // Add more tests for edge cases and specific XSD constructs
});