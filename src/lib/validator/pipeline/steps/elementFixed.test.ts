import { validateElementFixed } from "@lib/validator/pipeline/steps/elementFixed";
import { XSDElement } from "@lib/types/xsd";

const parser = new DOMParser();

function makeElement(text: string, tag = "Status"): Element {
  const doc = parser.parseFromString(`<${tag}>${text}</${tag}>`, "application/xml");
  return doc.documentElement!;
}

describe("validateElementFixed", () => {
  it("should return no errors when schema has no fixed value", () => {
    const el = makeElement("anything");
    const schema: XSDElement = { name: "Status", type: "xs:string" };
    expect(validateElementFixed(el, schema)).toEqual([]);
  });

  it("should return no errors when element content matches fixed value", () => {
    const el = makeElement("1.0");
    const schema: XSDElement = { name: "Status", fixed: "1.0" };
    expect(validateElementFixed(el, schema)).toEqual([]);
  });

  it("should return TYPE_MISMATCH error when element content differs from fixed value", () => {
    const el = makeElement("2.0");
    const schema: XSDElement = { name: "Version", fixed: "1.0" };
    const errors = validateElementFixed(el, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("TYPE_MISMATCH");
    expect(errors[0].expected).toBe("1.0");
    expect(errors[0].actual).toBe("2.0");
  });

  it("should skip fixed check for xsi:nil elements", () => {
    const doc = parser.parseFromString(
      `<Version xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/>`,
      "application/xml",
    );
    const el = doc.documentElement!;
    const schema: XSDElement = { name: "Version", fixed: "1.0", nillable: true };
    expect(validateElementFixed(el, schema)).toEqual([]);
  });
});
