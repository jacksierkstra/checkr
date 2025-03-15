import { DocumentExtractor } from "./documentExtractor";
import { XMLParser } from "@lib/xml/parser";

// Sample XSD string with two valid top-level nodes (an element and a complexType),
// and one invalid node (otherElement) that should be filtered out.
const sampleXSD = `
  <xs:schema targetNamespace="http://example.com" xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name="note" type="xs:string"/>
    <xs:complexType name="personType">
      <xs:sequence>
        <xs:element name="firstname" type="xs:string"/>
        <xs:element name="lastname" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
    <otherElement>Some text</otherElement>
  </xs:schema>
`;

describe("DocumentExtractor", () => {
  let xmlParserMock: XMLParser;
  let extractor: DocumentExtractor;

  beforeEach(() => {
    // Create a mock for XMLParser.
    xmlParserMock = {
      parse: jest.fn().mockImplementation((xsd: string) => {
        // For the test, we can use DOMParser. If you're using Jest with jsdom (the default),
        // DOMParser is available in the global scope.
        return new DOMParser().parseFromString(xsd, "text/xml");
      }),
    } as unknown as XMLParser;

    extractor = new DocumentExtractor(xmlParserMock);
  });

  test("parseDocument should delegate to the xmlParser", () => {
    const doc = extractor.parseDocument(sampleXSD);
    expect(xmlParserMock.parse).toHaveBeenCalledWith(sampleXSD);
    expect(doc.documentElement).toBeDefined();
    // The document element's tagName might be prefixed (e.g., "xs:schema")
    expect(doc.documentElement.localName).toBe("schema");
  });

  test("extractTopLevelSchemaNodes should return only valid XSD nodes", () => {
    const doc = extractor.parseDocument(sampleXSD);
    const nodes = extractor.extractTopLevelSchemaNodes(doc.documentElement);

    // We expect to extract the xs:element and xs:complexType nodes.
    expect(nodes.length).toBe(2);

    // Check that the extracted nodes have the expected names.
    const nodeNames = nodes.map((node) => node.getAttribute("name"));
    expect(nodeNames).toContain("note");
    expect(nodeNames).toContain("personType");
  });
});
