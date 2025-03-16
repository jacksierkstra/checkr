
import { XSDElement } from "@lib/types/xsd";
import { validateRequiredChildren } from "@lib/validator/pipeline/steps/requiredChildren";
import { DOMParser } from "@xmldom/xmldom";

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

    expect(errors).toContain(
      "Element <Child2> is required inside <Parent> but is missing."
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

    expect(errors).toContain(
      "Element <Child1> is required inside <Parent> but is missing."
    );
    expect(errors).toContain(
      "Element <Child2> is required inside <Parent> but is missing."
    );
  });
});
