import { XSDElement } from "@lib/types/xsd";
import { validateRequiredChildren } from "@lib/validator/pipeline/steps/requiredChildren";

describe("validateRequiredChildren", () => {
  const parser = new DOMParser();

  const parentElement: XSDElement = {
    name: "Parent",
    children: [
      { name: "Child1", minOccurs: 1 },
      { name: "Child2", minOccurs: 1 },
      { name: "OptionalChild", minOccurs: 0 },
    ],
  };

  it("should pass when all required children are present", () => {
    const xml = `
      <Parent>
        <Child1></Child1>
        <Child2></Child2>
      </Parent>
    `;

    const doc = parser.parseFromString(xml, "application/xml");
    const errors = validateRequiredChildren(doc.documentElement!, parentElement);

    expect(errors).toHaveLength(0);
  });

  it("should fail when a required child is missing", () => {
    const xml = `
      <Parent>
        <Child1></Child1>
      </Parent>
    `;

    const doc = parser.parseFromString(xml, "application/xml");
    const errors = validateRequiredChildren(doc.documentElement!, parentElement);

    expect(errors.map((e) => e.message)).toContain(
      "Element <Child2> is required inside <Parent> but is missing.",
    );
  });

  it("should pass when optional children are missing", () => {
    const xml = `
      <Parent>
        <Child1></Child1>
        <Child2></Child2>
      </Parent>
    `;

    const doc = parser.parseFromString(xml, "application/xml");
    const errors = validateRequiredChildren(doc.documentElement!, parentElement);

    expect(errors).toHaveLength(0);
  });

  it("should handle empty parent element with errors for required children", () => {
    const xml = `<Parent></Parent>`;

    const doc = parser.parseFromString(xml, "application/xml");
    const errors = validateRequiredChildren(doc.documentElement!, parentElement);

    expect(errors.map((e) => e.message)).toContain(
      "Element <Child1> is required inside <Parent> but is missing.",
    );
    expect(errors.map((e) => e.message)).toContain(
      "Element <Child2> is required inside <Parent> but is missing.",
    );
  });

  it("should pass when a required child appears minOccurs times", () => {
    const schema: XSDElement = {
      name: "List",
      children: [{ name: "Item", minOccurs: 2 }],
    };
    const xml = `<List><Item/><Item/></List>`;
    const doc = parser.parseFromString(xml, "application/xml");
    const errors = validateRequiredChildren(doc.documentElement!, schema);
    expect(errors).toHaveLength(0);
  });

  it("should fail when a required child appears fewer than minOccurs times", () => {
    const schema: XSDElement = {
      name: "List",
      children: [{ name: "Item", minOccurs: 3 }],
    };
    const xml = `<List><Item/><Item/></List>`;
    const doc = parser.parseFromString(xml, "application/xml");
    const errors = validateRequiredChildren(doc.documentElement!, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/insufficient occurrences/);
  });

  it("should default minOccurs to 1 when not specified", () => {
    const schema: XSDElement = {
      name: "Parent",
      children: [{ name: "RequiredChild" }],
    };
    const xml = `<Parent/>`;
    const doc = parser.parseFromString(xml, "application/xml");
    const errors = validateRequiredChildren(doc.documentElement!, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("MISSING_REQUIRED_ELEMENT");
  });

  it("should return no errors when schema has no children", () => {
    const schema: XSDElement = { name: "Leaf" };
    const xml = `<Leaf/>`;
    const doc = parser.parseFromString(xml, "application/xml");
    const errors = validateRequiredChildren(doc.documentElement!, schema);
    expect(errors).toEqual([]);
  });
});
