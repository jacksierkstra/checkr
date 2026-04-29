import { validateMixedContent } from "@lib/validator/pipeline/steps/mixedContent";
import { XSDElement } from "@lib/types/xsd";

const parser = new DOMParser();

function parse(xml: string): Element {
  return parser.parseFromString(xml, "application/xml").documentElement!;
}

const baseSchema: XSDElement = { name: "root" };

describe("validateMixedContent", () => {
  it("returns no error when element has only child elements (mixed not declared)", () => {
    const node = parse("<root><child>hello</child></root>");
    expect(validateMixedContent(node, baseSchema)).toEqual([]);
  });

  it("returns no error when element has only text content (no child elements)", () => {
    const node = parse("<root>some text</root>");
    expect(validateMixedContent(node, baseSchema)).toEqual([]);
  });

  it("returns no error when element has only whitespace text alongside child elements", () => {
    const node = parse("<root>\n  <child/>\n</root>");
    expect(validateMixedContent(node, baseSchema)).toEqual([]);
  });

  it("returns TYPE_MISMATCH when non-whitespace text coexists with child elements and mixed is not set", () => {
    const node = parse("<root>text<child/>more</root>");
    const errors = validateMixedContent(node, baseSchema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("TYPE_MISMATCH");
    expect(errors[0].element).toBe("root");
  });

  it("returns no error when mixed=true and text coexists with children", () => {
    const schema: XSDElement = { ...baseSchema, mixed: true };
    const node = parse("<root>text<child/>more</root>");
    expect(validateMixedContent(node, schema)).toEqual([]);
  });

  it("returns TYPE_MISMATCH when mixed is explicitly false and text coexists with children", () => {
    const schema: XSDElement = { ...baseSchema, mixed: false };
    const node = parse("<root>hello<child/></root>");
    const errors = validateMixedContent(node, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("TYPE_MISMATCH");
  });
});
