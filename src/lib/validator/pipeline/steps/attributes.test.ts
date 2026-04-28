import { XSDElement } from "@lib/types/xsd";
import { validateAttributes } from "@lib/validator/pipeline/steps/attributes";

describe("validateAttributes", () => {
  let parser: DOMParser;

  beforeEach(() => {
    parser = new DOMParser();
  });

  function createElement(tag: string, attributes: Record<string, string> = {}): Element {
    const attrString = Object.entries(attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(" ");
    const xml = `<${tag} ${attrString}></${tag}>`;
    return parser.parseFromString(xml, "application/xml").documentElement!;
  }

  it("should pass when all required attributes are present", () => {
    const element = createElement("Item", { id: "123" });
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "id", type: "xs:string", use: "required" }],
    };

    expect(validateAttributes(element, schema)).toEqual([]);
  });

  it("should fail when a required attribute is missing", () => {
    const element = createElement("Item");
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "id", type: "xs:string", use: "required" }],
    };

    const errors = validateAttributes(element, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/Missing required attribute 'id'/);
  });

  it("should validate fixed attributes correctly", () => {
    const element = createElement("Item", { category: "electronics" });
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "category", type: "xs:string", fixed: "books" }],
    };

    const errors = validateAttributes(element, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/must be fixed to 'books'/);
  });

  it("should validate integer attributes", () => {
    const element = createElement("Item", { price: "abc" });
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "price", type: "xs:integer" }],
    };

    const errors = validateAttributes(element, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/must be an integer/);
  });

  it("should return no errors when schema has no attributes (open model)", () => {
    const element = createElement("Item", { unknownAttr: "value" });
    const schema: XSDElement = { name: "Item" };

    expect(validateAttributes(element, schema)).toEqual([]);
  });

  it("should report ATTRIBUTE_INVALID for undeclared attributes", () => {
    const element = createElement("Item", { id: "123", unknownAttr: "value" });
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "id", type: "xs:string" }],
    };

    const errors = validateAttributes(element, schema);
    expect(
      errors.some((e) => e.code === "ATTRIBUTE_INVALID" && e.message.includes("unknownAttr")),
    ).toBe(true);
  });

  it("should not flag xmlns namespace declarations as unexpected", () => {
    const xml = `<Item xmlns:ex="http://example.com" id="123"></Item>`;
    const element = parser.parseFromString(xml, "application/xml").documentElement!;
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "id", type: "xs:string" }],
    };

    const errors = validateAttributes(element, schema);
    expect(errors.filter((e) => e.message.includes("xmlns"))).toHaveLength(0);
  });
});
