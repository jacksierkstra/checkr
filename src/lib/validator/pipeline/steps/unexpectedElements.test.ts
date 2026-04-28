import { XSDElement } from "@lib/types/xsd";
import { validateUnexpectedElements } from "./unexpectedElements";

describe("validateUnexpectedElements", () => {
  let domParser: DOMParser;

  beforeEach(() => {
    domParser = new DOMParser();
  });

  function parseNode(xml: string): Element {
    return domParser.parseFromString(xml, "text/xml").documentElement!;
  }

  it("returns no errors when all children are declared", () => {
    const node = parseNode(`<person><name>Alice</name></person>`);
    const schema: XSDElement = {
      name: "person",
      children: [{ name: "name", type: "xs:string" }],
    };
    expect(validateUnexpectedElements(node, schema)).toEqual([]);
  });

  it("returns UNEXPECTED_ELEMENT for undeclared children", () => {
    const node = parseNode(`<person><name>Alice</name><unknown>extra</unknown></person>`);
    const schema: XSDElement = {
      name: "person",
      children: [{ name: "name", type: "xs:string" }],
    };
    const errors = validateUnexpectedElements(node, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("UNEXPECTED_ELEMENT");
    expect(errors[0].message).toMatch(/unknown/);
  });

  it("returns no errors when schema.children is empty (open model)", () => {
    const node = parseNode(`<person><anything>foo</anything></person>`);
    const schema: XSDElement = { name: "person" };
    expect(validateUnexpectedElements(node, schema)).toEqual([]);
  });

  it("ignores text nodes", () => {
    const node = parseNode(`<person><name>Alice</name></person>`);
    const schema: XSDElement = {
      name: "person",
      children: [{ name: "name", type: "xs:string" }],
    };
    expect(validateUnexpectedElements(node, schema)).toEqual([]);
  });

  it("reports multiple unexpected elements", () => {
    const node = parseNode(`<person><name>Alice</name><foo>1</foo><bar>2</bar></person>`);
    const schema: XSDElement = {
      name: "person",
      children: [{ name: "name", type: "xs:string" }],
    };
    const errors = validateUnexpectedElements(node, schema);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.element)).toEqual(["foo", "bar"]);
  });
});
