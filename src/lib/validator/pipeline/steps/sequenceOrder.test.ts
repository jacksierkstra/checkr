import { XSDElement } from "@lib/types/xsd";
import { validateSequenceOrder } from "./sequenceOrder";

const parser = new DOMParser();

function makeElement(xml: string): Element {
  return parser.parseFromString(xml, "application/xml").documentElement!;
}

describe("validateSequenceOrder", () => {
  it("should return no errors when children are in correct order", () => {
    const xml = `<Person><FirstName>John</FirstName><LastName>Doe</LastName></Person>`;
    const schema: XSDElement = {
      name: "Person",
      children: [{ name: "FirstName" }, { name: "LastName" }],
    };
    expect(validateSequenceOrder(makeElement(xml), schema)).toEqual([]);
  });

  it("should return SEQUENCE_VIOLATION when children are out of order", () => {
    const xml = `<Person><LastName>Doe</LastName><FirstName>John</FirstName></Person>`;
    const schema: XSDElement = {
      name: "Person",
      children: [{ name: "FirstName" }, { name: "LastName" }],
    };
    const errors = validateSequenceOrder(makeElement(xml), schema);
    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe("SEQUENCE_VIOLATION");
    expect(errors[0].message).toMatch(/FirstName/);
  });

  it("should allow optional elements to be absent", () => {
    const xml = `<Person><LastName>Doe</LastName></Person>`;
    const schema: XSDElement = {
      name: "Person",
      children: [{ name: "FirstName", minOccurs: 0 }, { name: "LastName" }],
    };
    expect(validateSequenceOrder(makeElement(xml), schema)).toEqual([]);
  });

  it("should return no errors when no schema children are defined (open model)", () => {
    const xml = `<Person><LastName>Doe</LastName><FirstName>John</FirstName></Person>`;
    const schema: XSDElement = { name: "Person" };
    expect(validateSequenceOrder(makeElement(xml), schema)).toEqual([]);
  });

  it("should allow repeated elements in declared order", () => {
    const xml = `<List><Item>a</Item><Item>b</Item><Item>c</Item></List>`;
    const schema: XSDElement = {
      name: "List",
      children: [{ name: "Item", maxOccurs: -1 }],
    };
    expect(validateSequenceOrder(makeElement(xml), schema)).toEqual([]);
  });
});
