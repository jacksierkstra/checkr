import { validateAllChildren } from "@lib/validator/pipeline/steps/allChildren";
import { XSDElement } from "@lib/types/xsd";

const parser = new DOMParser();

function parse(xml: string): Element {
  return parser.parseFromString(xml, "application/xml").documentElement!;
}

describe("validateAllChildren (xs:all full semantics)", () => {
  it("returns no error when there are no xs:all children in the schema", () => {
    const schema: XSDElement = {
      name: "root",
      children: [{ name: "A" }, { name: "B" }],
    };
    const node = parse("<root><A/><B/></root>");
    expect(validateAllChildren(node, schema)).toEqual([]);
  });

  it("returns no error when xs:all children each appear exactly once", () => {
    const schema: XSDElement = {
      name: "root",
      children: [
        { name: "A", inAll: true },
        { name: "B", inAll: true },
      ],
    };
    const node = parse("<root><B/><A/></root>");
    expect(validateAllChildren(node, schema)).toEqual([]);
  });

  it("returns OCCURRENCE_VIOLATION when xs:all child with maxOccurs=1 appears twice", () => {
    const schema: XSDElement = {
      name: "root",
      children: [{ name: "A", inAll: true, maxOccurs: 1 }],
    };
    const node = parse("<root><A/><A/></root>");
    expect(validateAllChildren(node, schema).some((e) => e.code === "OCCURRENCE_VIOLATION")).toBe(
      true,
    );
  });

  it("returns OCCURRENCE_VIOLATION when xs:all child with maxOccurs=unbounded appears more than once", () => {
    const schema: XSDElement = {
      name: "root",
      children: [{ name: "A", inAll: true, maxOccurs: "unbounded" }],
    };
    const node = parse("<root><A/><A/></root>");
    const errors = validateAllChildren(node, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("OCCURRENCE_VIOLATION");
    expect(errors[0].element).toBe("A");
    expect(errors[0].actual).toBe(2);
    expect(errors[0].expected).toBe(1);
  });

  it("returns OCCURRENCE_VIOLATION when xs:all child with maxOccurs=3 appears more than once", () => {
    const schema: XSDElement = {
      name: "root",
      children: [{ name: "Tag", inAll: true, maxOccurs: 3 }],
    };
    const node = parse("<root><Tag/><Tag/><Tag/></root>");
    const errors = validateAllChildren(node, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("OCCURRENCE_VIOLATION");
    expect(errors[0].actual).toBe(3);
  });

  it("returns no error when xs:all child with maxOccurs=unbounded appears exactly once", () => {
    const schema: XSDElement = {
      name: "root",
      children: [{ name: "A", inAll: true, maxOccurs: "unbounded" }],
    };
    const node = parse("<root><A/></root>");
    expect(validateAllChildren(node, schema)).toEqual([]);
  });

  it("does not produce errors for non-inAll children even if they are repeated", () => {
    const schema: XSDElement = {
      name: "root",
      children: [{ name: "Item", maxOccurs: "unbounded" }],
    };
    const node = parse("<root><Item/><Item/></root>");
    expect(validateAllChildren(node, schema)).toEqual([]);
  });
});
