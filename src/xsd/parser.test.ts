import { XSDSchema } from "@lib/types/xsd";
import { XMLParserImpl } from "@lib/xml/parser";
import { XSDParserImpl } from "@lib/xsd/parser";

describe("XSDParser", () => {
  let parser: XSDParserImpl;

  beforeAll(() => {
    const xmlParser = new XMLParserImpl();
    parser = new XSDParserImpl(xmlParser);
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
});
