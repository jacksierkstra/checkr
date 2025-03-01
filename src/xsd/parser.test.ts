import { XMLParserImpl } from "@lib/xml/parser";
import { XSDParserImpl } from "@lib/xsd/parser";
import { XSDSchema, XSDElement } from "@lib/types/xsd";

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

  it("should parse the targetNamespace and handle empty elements", async () => {
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

  it("should extract attributes from xs:element", async () => {
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
      expect(categoryAttribute?.use).toBe("optional"); // Default is optional.

      const fixedValueAttribute = itemElement?.attributes?.find((attr) => attr.name === "fixedValue");
      expect(fixedValueAttribute).toBeDefined();
      expect(fixedValueAttribute?.fixed).toBe("fixedString");
    });
  });

  it("should handle elements without attributes", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="SimpleItem"/>
      </xs:schema>
    `;
    await parseAndExpect(xsd, (schema) => {
      expect(schema.elements).toHaveLength(1);

      const simpleItem = schema.elements.find((el) => el.name === "SimpleItem");
      expect(simpleItem).toBeDefined();
      expect(simpleItem?.attributes).toHaveLength(0);
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
