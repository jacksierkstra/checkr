import { validateType } from "@lib/validator/pipeline/steps/type";
import { XSDElement } from "@lib/types/xsd";

const parser = new DOMParser();

function makeElement(text: string): Element {
  const doc = parser.parseFromString(`<r>${text}</r>`, "application/xml");
  return doc.documentElement!;
}

describe("xs:whiteSpace facet normalization", () => {
  it("preserve: keeps text exactly as-is, including leading/trailing whitespace", () => {
    const el = makeElement("  hello  ");
    const schema: XSDElement = { name: "r", type: "xs:string", whiteSpace: "preserve" };
    expect(validateType(el, schema)).toEqual([]);
  });

  it("replace: replaces tabs/newlines with spaces, does not collapse or trim", () => {
    const el = makeElement("hello\tworld");
    const schema: XSDElement = {
      name: "r",
      type: "xs:string",
      whiteSpace: "replace",
      pattern: "hello world",
    };
    expect(validateType(el, schema)).toEqual([]);
  });

  it("collapse: collapses multiple whitespace into one and trims", () => {
    const el = makeElement("  hello   world  ");
    const schema: XSDElement = {
      name: "r",
      type: "xs:string",
      whiteSpace: "collapse",
      pattern: "hello world",
    };
    expect(validateType(el, schema)).toEqual([]);
  });

  it("collapse: fails pattern when value is not normalized", () => {
    const el = makeElement("  hello   world  ");
    const schema: XSDElement = {
      name: "r",
      type: "xs:string",
      whiteSpace: "preserve",
      pattern: "hello world",
    };
    const errors = validateType(el, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe("PATTERN_MISMATCH");
  });

  it("collapse: applies to minLength check (counts normalized length)", () => {
    const el = makeElement("  a  ");
    const schema: XSDElement = {
      name: "r",
      type: "xs:string",
      whiteSpace: "collapse",
      minLength: 3,
    };
    const errors = validateType(el, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe("RANGE_VIOLATION");
  });

  it("collapse: applies to maxLength check", () => {
    const el = makeElement("  a  b  c  ");
    const schema: XSDElement = {
      name: "r",
      type: "xs:string",
      whiteSpace: "collapse",
      maxLength: 4,
    };
    // "a b c" is 5 chars — should fail
    const errors = validateType(el, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe("RANGE_VIOLATION");
  });

  it("restriction whiteSpace is also respected", () => {
    const el = makeElement("  hello   world  ");
    const schema: XSDElement = {
      name: "r",
      type: "xs:string",
      restriction: {
        base: "xs:string",
        whiteSpace: "collapse",
        pattern: "hello world",
      },
    };
    expect(validateType(el, schema)).toEqual([]);
  });
});
