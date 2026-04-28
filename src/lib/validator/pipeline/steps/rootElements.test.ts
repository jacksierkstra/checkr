import { XSDSchema } from "@lib/types/xsd";
import { validateRootElements } from "@lib/validator/pipeline/steps/rootElements";

describe("validateRootElements", () => {
  const parser = new DOMParser();

  function parseXml(xml: string): Document {
    return parser.parseFromString(xml, "application/xml");
  }

  const emptyTypes = {};

  it("returns no errors when all required root elements are present", () => {
    const xml = `<root><Person/><Address/></root>`;
    const schema: XSDSchema = {
      elements: [
        { name: "Person", minOccurs: 1 },
        { name: "Address", minOccurs: 1 },
      ],
      types: emptyTypes,
    };
    const errors = validateRootElements(parseXml(xml), schema);
    expect(errors).toEqual([]);
  });

  it("returns an error when a required root element is missing", () => {
    const xml = `<root><Person/></root>`;
    const schema: XSDSchema = {
      elements: [
        { name: "Person", minOccurs: 1 },
        { name: "Address", minOccurs: 1 },
      ],
      types: emptyTypes,
    };
    const errors = validateRootElements(parseXml(xml), schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("MISSING_REQUIRED_ELEMENT");
    expect(errors[0].element).toBe("Address");
    expect(errors[0].message).toMatch(/Address/);
  });

  it("returns no errors when optional elements are absent", () => {
    const xml = `<root><Person/></root>`;
    const schema: XSDSchema = {
      elements: [
        { name: "Person", minOccurs: 1 },
        { name: "Address", minOccurs: 0 },
      ],
      types: emptyTypes,
    };
    const errors = validateRootElements(parseXml(xml), schema);
    expect(errors).toEqual([]);
  });

  it("defaults minOccurs to 1 when not specified and element is absent", () => {
    const xml = `<root/>`;
    const schema: XSDSchema = {
      elements: [{ name: "Person" }],
      types: emptyTypes,
    };
    const errors = validateRootElements(parseXml(xml), schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("MISSING_REQUIRED_ELEMENT");
  });

  it("returns no errors when schema has no elements", () => {
    const xml = `<root/>`;
    const schema: XSDSchema = { elements: [], types: emptyTypes };
    const errors = validateRootElements(parseXml(xml), schema);
    expect(errors).toEqual([]);
  });

  it("reports insufficient occurrences when count is below minOccurs", () => {
    const xml = `<root><Item/></root>`;
    const schema: XSDSchema = {
      elements: [{ name: "Item", minOccurs: 3 }],
      types: emptyTypes,
    };
    const errors = validateRootElements(parseXml(xml), schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/insufficient occurrences/);
  });

  it("uses getElementsByTagNameNS when the element has a namespace", () => {
    const ns = "http://example.com/ns";
    const xml = `<root xmlns:ex="${ns}"><ex:Person/></root>`;
    const schema: XSDSchema = {
      elements: [{ name: "Person", namespace: ns, minOccurs: 1 }],
      types: emptyTypes,
    };
    const errors = validateRootElements(parseXml(xml), schema);
    expect(errors).toEqual([]);
  });
});
