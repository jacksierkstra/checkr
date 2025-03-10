import { XSDSchema } from "@lib/types/xsd";
import { XMLParserImpl } from "@lib/xml/parser";
import { XSDParser } from "@lib/xsd/parser";
import { XSDPipelineParserImpl } from "@lib/xsd/pipeline/parser";
import { XSDStandardParserImpl } from "@lib/xsd/standard";



const runCommonTests = (xsdParser: XSDParser) => {
  let parser: XSDParser;

  beforeAll(() => {
    parser = xsdParser;
  });

  const parseAndExpect = async (xsd: string, expectations: (schema: XSDSchema) => void) => {
    const schema = await parser.parse(xsd);
    expectations(schema);
  };

  it("should parse the targetNamespace and handle empty schema", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
      </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.targetNamespace).toBe("http://example.com/schema");
      expect(schema.elements).toHaveLength(0);
    });
  });

  it("should extract global xs:element declarations", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Person" type="xs:string"/>
        <xs:element name="Address" type="xs:string"/>
      </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(2);

      const personElement = schema.elements.find((el) => el.name === "Person");
      expect(personElement).toBeDefined();
      expect(personElement?.type).toBe("xs:string");

      const addressElement = schema.elements.find((el) => el.name === "Address");
      expect(addressElement).toBeDefined();
      expect(addressElement?.type).toBe("xs:string");
    });
  });

  it("should extract attributes from elements", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Item">
          <xs:attribute name="id" type="xs:integer" use="required"/>
          <xs:attribute name="category" type="xs:string"/>
          <xs:attribute name="fixedValue" type="xs:string" fixed="fixedString"/>
        </xs:element>
      </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(1);

      const itemElement = schema.elements.find((el) => el.name === "Item");
      expect(itemElement).toBeDefined();
      expect(itemElement?.attributes).toHaveLength(3);

      const idAttribute = itemElement?.attributes?.find((attr) => attr.name === "id");
      expect(idAttribute).toBeDefined();
      expect(idAttribute?.type).toBe("xs:integer");
      expect(idAttribute?.use).toBe("required");

      const categoryAttribute = itemElement?.attributes?.find((attr) => attr.name === "category");
      expect(categoryAttribute).toBeDefined();
      expect(categoryAttribute?.type).toBe("xs:string");
      expect(categoryAttribute?.use).toBe("optional");

      const fixedValueAttribute = itemElement?.attributes?.find((attr) => attr.name === "fixedValue");
      expect(fixedValueAttribute).toBeDefined();
      expect(fixedValueAttribute?.fixed).toBe("fixedString");
    });
  });

  it("should parse minOccurs and maxOccurs correctly", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Product" minOccurs="1" maxOccurs="5"/>
      </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(1);

      const productElement = schema.elements.find((el) => el.name === "Product");
      expect(productElement).toBeDefined();
      expect(productElement?.minOccurs).toBe(1);
      expect(productElement?.maxOccurs).toBe(5);
    });
  });

  it("should handle default minOccurs and maxOccurs", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Product"/>
      </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(1);

      const productElement = schema.elements.find((el) => el.name === "Product");
      expect(productElement).toBeDefined();
      expect(productElement?.minOccurs).toBe(0); // Default
      expect(productElement?.maxOccurs).toBe(1); // Default
    });
  });

  it("should parse nested elements inside complex types", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Order">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="Item" minOccurs="1" maxOccurs="unbounded"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(1);

      const orderElement = schema.elements.find((el) => el.name === "Order");
      expect(orderElement).toBeDefined();
      expect(orderElement?.children).toHaveLength(1);

      const itemElement = orderElement?.children?.find((el) => el.name === "Item");
      expect(itemElement).toBeDefined();
      expect(itemElement?.minOccurs).toBe(1);
      expect(itemElement?.maxOccurs).toBeNaN(); // "unbounded" is parsed as NaN
    });
  });

  it("should handle multiple nested elements", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Company">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="Employee"/>
              <xs:element name="Department"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(1);

      const companyElement = schema.elements.find((el) => el.name === "Company");
      expect(companyElement).toBeDefined();
      expect(companyElement?.children).toHaveLength(2);

      const employeeElement = companyElement?.children?.find((el) => el.name === "Employee");
      expect(employeeElement).toBeDefined();
      expect(employeeElement?.name).toBe("Employee");

      const departmentElement = companyElement?.children?.find((el) => el.name === "Department");
      expect(departmentElement).toBeDefined();
      expect(departmentElement?.name).toBe("Department");
    });
  });

  it("should handle missing element names gracefully", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element type="xs:string"/>
      </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(0);
    });
  });

  it("should parse enumeration restrictions", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="Status">
                <xs:simpleType>
                    <xs:restriction base="xs:string">
                        <xs:enumeration value="Pending"/>
                        <xs:enumeration value="Approved"/>
                        <xs:enumeration value="Rejected"/>
                    </xs:restriction>
                </xs:simpleType>
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const statusElement = schema.elements.find((el) => el.name === "Status");
      expect(statusElement?.enumeration).toEqual(["Pending", "Approved", "Rejected"]);
    });
  });

  it("should parse pattern restrictions", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="Code">
                <xs:simpleType>
                    <xs:restriction base="xs:string">
                        <xs:pattern value="[A-Z]{3}[0-9]{2}"/>
                    </xs:restriction>
                </xs:simpleType>
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const codeElement = schema.elements.find((el) => el.name === "Code");
      expect(codeElement?.pattern).toBe("[A-Z]{3}[0-9]{2}");
    });
  });

  it("should parse minLength and maxLength restrictions", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="Comment">
                <xs:simpleType>
                    <xs:restriction base="xs:string">
                        <xs:minLength value="10"/>
                        <xs:maxLength value="100"/>
                    </xs:restriction>
                </xs:simpleType>
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const commentElement = schema.elements.find((el) => el.name === "Comment");
      expect(commentElement?.minLength).toBe(10);
      expect(commentElement?.maxLength).toBe(100);
    });
  });

  it("should parse all restrictions combined", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="ComplexString">
                <xs:simpleType>
                    <xs:restriction base="xs:string">
                        <xs:enumeration value="Value1"/>
                        <xs:enumeration value="Value2"/>
                        <xs:pattern value="[A-Z]+"/>
                        <xs:minLength value="3"/>
                        <xs:maxLength value="10"/>
                    </xs:restriction>
                </xs:simpleType>
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const complexStringElement = schema.elements.find((el) => el.name === "ComplexString");
      expect(complexStringElement?.enumeration).toEqual(["Value1", "Value2"]);
      expect(complexStringElement?.pattern).toBe("[A-Z]+");
      expect(complexStringElement?.minLength).toBe(3);
      expect(complexStringElement?.maxLength).toBe(10);
    });
  });

  it("should handle whitespace in attribute values", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="Item">
                <xs:attribute name=" attr1 " type=" xs:integer " fixed=" fixed value " />
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const itemElement = schema.elements.find((el) => el.name === "Item");
      const attr1 = itemElement?.attributes?.find((attr) => attr.name === " attr1 ");
      expect(attr1?.type).toBe(" xs:integer ");
      expect(attr1?.fixed).toBe(" fixed value ");
    });
  });

  it("should handle whitespace in enumeration values", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="Status">
                <xs:simpleType>
                    <xs:restriction base="xs:string">
                        <xs:enumeration value=" Value 1 "/>
                        <xs:enumeration value="Value 2"/>
                    </xs:restriction>
                </xs:simpleType>
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const statusElement = schema.elements.find((el) => el.name === "Status");
      expect(statusElement?.enumeration).toEqual([" Value 1 ", "Value 2"]);
    });
  });

  it("should handle maxOccurs='unbounded' in nested elements", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="Order">
                <xs:complexType>
                    <xs:sequence>
                        <xs:element name="Item" maxOccurs="unbounded"/>
                    </xs:sequence>
                </xs:complexType>
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const orderElement = schema.elements.find((el) => el.name === "Order");
      const itemElement = orderElement?.children?.find((el) => el.name === "Item");
      expect(itemElement?.maxOccurs).toBeNaN();
    });
  });

  it("should parse nested complex types", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="Root">
                <xs:complexType>
                    <xs:sequence>
                        <xs:element name="Nested">
                            <xs:complexType>
                                <xs:sequence>
                                    <xs:element name="Inner"/>
                                </xs:sequence>
                            </xs:complexType>
                        </xs:element>
                    </xs:sequence>
                </xs:complexType>
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const rootElement = schema.elements.find((el) => el.name === "Root");
      const nestedElement = rootElement?.children?.find((el) => el.name === "Nested");
      const innerElement = nestedElement?.children?.find((el) => el.name === "Inner");
      expect(innerElement).toBeDefined();
    });
  });

  it("should handle empty complex types", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="Empty">
                <xs:complexType/>
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const emptyElement = schema.elements.find((el) => el.name === "Empty");
      expect(emptyElement?.children).toHaveLength(0);
      expect(emptyElement?.attributes).toHaveLength(0);
    });
  });

  it("should handle empty enumeration values", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name="Status">
                <xs:simpleType>
                    <xs:restriction base="xs:string">
                        <xs:enumeration value="Value1"/>
                        <xs:enumeration value=""/>
                        <xs:enumeration value="Value3"/>
                    </xs:restriction>
                </xs:simpleType>
            </xs:element>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const statusElement = schema.elements.find((el) => el.name === "Status");
      expect(statusElement?.enumeration).toEqual(["Value1", "", "Value3"]);
    });
  });

  it("should handle elements with namespaces", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:ex="http://example.com">
            <xs:element name="ex:Data"/>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      const dataElement = schema.elements.find((el) => el.name === "ex:Data");
      expect(dataElement).toBeDefined();
    });
  });

  it("should handle elements with empty names", async () => {
    const xsd = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:element name=""/>
        </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(0);
    });
  });

  it('should parse xsd', async () => {
    const xsd = `
         <xs:schema xmlns="http://www.w3.org/2001/XMLSchema">
                <xs:element name="root" type="SimpleType"/>
                <xs:complexType name="SimpleType">
                    <xs:sequence>
                      <xs:element name="foo" type="xs:string"/>
                      <xs:element name="bar" type="xs:string"/>
                    </xs:sequence>
                </xs:complexType>
          </xs:schema>
    `;
    
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(2);
      const complexType = schema.elements.filter(el => el.name === 'SimpleType').at(0);
      expect(complexType?.children).toHaveLength(2);
    });

  });

};

describe('XSDParser Implementations', () => {
  const xmlParser = new XMLParserImpl();

  // describe('XSDStandardParserImpl', () => {
  //   runCommonTests(new XSDStandardParserImpl(xmlParser));
  // });

  describe('XSDPipelineParserImpl', () => {
    runCommonTests(new XSDPipelineParserImpl(xmlParser));
  });

});
