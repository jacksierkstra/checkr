import { validateType } from "@lib/validator/pipeline/steps/type";
import { XSDElement } from "@lib/types/xsd";

const parser = new DOMParser();

function makeNode(text: string): Element {
  const doc = parser.parseFromString(`<scores>${text}</scores>`, "application/xml");
  return doc.documentElement!;
}

describe("validateType — xs:list restriction facets", () => {
  const baseListSchema: XSDElement = { name: "scores", listItemType: "xs:integer" };

  it("validates items without facets (baseline)", () => {
    expect(validateType(makeNode("1 2 3"), baseListSchema)).toEqual([]);
  });

  describe("xs:length on xs:list", () => {
    const schema: XSDElement = { ...baseListSchema, length: 3 };

    it("passes when token count equals length", () => {
      expect(validateType(makeNode("1 2 3"), schema)).toEqual([]);
    });

    it("returns RANGE_VIOLATION when too few tokens", () => {
      const errors = validateType(makeNode("1 2"), schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RANGE_VIOLATION");
      expect(errors[0].actual).toBe(2);
      expect(errors[0].expected).toBe(3);
    });

    it("returns RANGE_VIOLATION when too many tokens", () => {
      const errors = validateType(makeNode("1 2 3 4"), schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RANGE_VIOLATION");
      expect(errors[0].actual).toBe(4);
    });
  });

  describe("xs:minLength on xs:list", () => {
    const schema: XSDElement = { ...baseListSchema, minLength: 2 };

    it("passes when token count >= minLength", () => {
      expect(validateType(makeNode("1 2 3"), schema)).toEqual([]);
    });

    it("returns RANGE_VIOLATION when too few tokens", () => {
      const errors = validateType(makeNode("1"), schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RANGE_VIOLATION");
      expect(errors[0].actual).toBe(1);
      expect(errors[0].expected).toBe(2);
    });
  });

  describe("xs:maxLength on xs:list", () => {
    const schema: XSDElement = { ...baseListSchema, maxLength: 3 };

    it("passes when token count <= maxLength", () => {
      expect(validateType(makeNode("10 20"), schema)).toEqual([]);
    });

    it("returns RANGE_VIOLATION when too many tokens", () => {
      const errors = validateType(makeNode("1 2 3 4"), schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RANGE_VIOLATION");
      expect(errors[0].actual).toBe(4);
      expect(errors[0].expected).toBe(3);
    });
  });

  describe("xs:enumeration on xs:list", () => {
    const schema: XSDElement = {
      ...baseListSchema,
      enumeration: ["1 2 3", "4 5 6"],
    };

    it("passes when value matches an enumerated list", () => {
      expect(validateType(makeNode("1 2 3"), schema)).toEqual([]);
    });

    it("returns TYPE_MISMATCH when value does not match any enumeration", () => {
      const errors = validateType(makeNode("7 8 9"), schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("TYPE_MISMATCH");
    });
  });

  it("still validates item types when list-level facets are also present", () => {
    const schema: XSDElement = { ...baseListSchema, minLength: 2, maxLength: 5 };
    const errors = validateType(makeNode("1 abc 3"), schema);
    // "abc" is not a valid xs:integer
    expect(errors.some((e) => e.code === "TYPE_MISMATCH")).toBe(true);
  });
});
