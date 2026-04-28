import { XSDElement } from "@lib/types/xsd";
import { validateAbstract } from "@lib/validator/pipeline/steps/abstract";

describe("validateAbstract", () => {
  const parser = new DOMParser();

  function makeNode(tagName: string): Element {
    return parser.parseFromString(`<${tagName}/>`, "application/xml").documentElement!;
  }

  it("returns an error when schema marks the element as abstract", () => {
    const node = makeNode("Person");
    const schema: XSDElement = { name: "Person", abstract: true };
    const errors = validateAbstract(node, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("ABSTRACT_ELEMENT");
    expect(errors[0].message).toMatch(/Person/);
    expect(errors[0].element).toBe("Person");
  });

  it("returns no errors when schema marks the element as non-abstract", () => {
    const node = makeNode("Person");
    const schema: XSDElement = { name: "Person", abstract: false };
    const errors = validateAbstract(node, schema);
    expect(errors).toEqual([]);
  });

  it("returns no errors when the abstract property is absent", () => {
    const node = makeNode("Person");
    const schema: XSDElement = { name: "Person" };
    const errors = validateAbstract(node, schema);
    expect(errors).toEqual([]);
  });
});
