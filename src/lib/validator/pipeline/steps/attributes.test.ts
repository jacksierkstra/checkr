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

  it("should validate xs:decimal attribute type", () => {
    const element = createElement("Item", { price: "not-a-number" });
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "price", type: "xs:decimal" }],
    };
    const errors = validateAttributes(element, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/must be a decimal number/);
  });

  it("should pass valid xs:decimal attribute", () => {
    const element = createElement("Item", { price: "3.14" });
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "price", type: "xs:decimal" }],
    };
    expect(validateAttributes(element, schema)).toEqual([]);
  });

  it("should validate xs:date attribute type", () => {
    const element = createElement("Item", { created: "not-a-date" });
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "created", type: "xs:date" }],
    };
    const errors = validateAttributes(element, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/must be a valid date/);
  });

  it("should validate xs:boolean attribute type", () => {
    const element = createElement("Item", { active: "yes" });
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "active", type: "xs:boolean" }],
    };
    const errors = validateAttributes(element, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/must be a boolean/);
  });

  it("should treat absent optional attribute as present when schema provides a default", () => {
    const element = createElement("Item");
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "status", type: "xs:string", default: "active" }],
    };
    expect(validateAttributes(element, schema)).toEqual([]);
  });

  it("should still require a required attribute even if a default is set", () => {
    const element = createElement("Item");
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "id", type: "xs:string", use: "required", default: "auto" }],
    };
    const errors = validateAttributes(element, schema);
    expect(errors.some((e) => e.code === "ATTRIBUTE_MISSING")).toBe(true);
  });

  it("should validate the default value against the declared type", () => {
    const element = createElement("Item");
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "count", type: "xs:integer", default: "not-an-int" }],
    };
    const errors = validateAttributes(element, schema);
    expect(errors.some((e) => e.code === "ATTRIBUTE_INVALID")).toBe(true);
  });

  it("should apply default value for fixed check when attribute is absent", () => {
    const element = createElement("Item");
    const schema: XSDElement = {
      name: "Item",
      attributes: [{ name: "version", type: "xs:string", fixed: "1.0", default: "2.0" }],
    };
    const errors = validateAttributes(element, schema);
    expect(errors.some((e) => e.code === "ATTRIBUTE_INVALID")).toBe(true);
  });
});
