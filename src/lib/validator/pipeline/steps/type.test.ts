import { XSDElement } from "@lib/types/xsd";
import { validateType } from "@lib/validator/pipeline/steps/type";

describe("validateType step", () => {
  let parser: DOMParser;

  beforeEach(() => {
    parser = new DOMParser();
  });

  function createElementWithText(tagName: string, text: string): Element {
    const xml = `<${tagName}>${text}</${tagName}>`;
    return parser.parseFromString(xml, "application/xml").documentElement!;
  }

  it("should skip validation if no type is specified", () => {
    const node = createElementWithText("Test", "any content");
    const schemaElement: XSDElement = { name: "Test" }; // no type
    const errors = validateType(node, schemaElement);
    expect(errors).toEqual([]);
  });

  it("should handle enumerations correctly", () => {
    const nodeValid = createElementWithText("Status", "Approved");
    const nodeInvalid = createElementWithText("Status", "InvalidValue");

    const schemaElement: XSDElement = {
      name: "Status",
      type: "xs:string",
      enumeration: ["Pending", "Approved", "Rejected"],
    };

    // Valid enumeration
    const validErrors = validateType(nodeValid, schemaElement);
    expect(validErrors).toEqual([]);

    // Invalid enumeration
    const invalidErrors = validateType(nodeInvalid, schemaElement);
    expect(invalidErrors).toHaveLength(1);
    expect(invalidErrors[0].message).toMatch(/must be one of \[Pending, Approved, Rejected\]/);
  });

  it("should validate xs:string (accept everything)", () => {
    const node = createElementWithText("Test", "hello world");
    const schemaElement: XSDElement = { name: "Test", type: "xs:string" };
    const errors = validateType(node, schemaElement);
    expect(errors).toEqual([]);
  });

  it("should validate xs:integer - success", () => {
    const node = createElementWithText("Age", "123");
    const schemaElement: XSDElement = { name: "Age", type: "xs:integer" };
    const errors = validateType(node, schemaElement);
    expect(errors).toEqual([]);
  });

  it("should validate xs:integer - fail", () => {
    const node = createElementWithText("Age", "12x3");
    const schemaElement: XSDElement = { name: "Age", type: "xs:integer" };
    const errors = validateType(node, schemaElement);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/must be an integer/);
  });

  it("should validate xs:decimal - success", () => {
    const node = createElementWithText("Price", "12.34");
    const schemaElement: XSDElement = { name: "Price", type: "xs:decimal" };
    const errors = validateType(node, schemaElement);
    expect(errors).toEqual([]);
  });

  it("should validate xs:decimal - fail", () => {
    const node = createElementWithText("Price", "abc");
    const schemaElement: XSDElement = { name: "Price", type: "xs:decimal" };
    const errors = validateType(node, schemaElement);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/must be a decimal/);
  });

  it("should validate xs:boolean - success (true)", () => {
    const node = createElementWithText("Flag", "true");
    const schemaElement: XSDElement = { name: "Flag", type: "xs:boolean" };
    const errors = validateType(node, schemaElement);
    expect(errors).toEqual([]);
  });

  it("should validate xs:boolean - fail", () => {
    const node = createElementWithText("Flag", "not_boolean");
    const schemaElement: XSDElement = { name: "Flag", type: "xs:boolean" };
    const errors = validateType(node, schemaElement);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/must be a boolean/);
  });

  it("should validate xs:date - success", () => {
    const node = createElementWithText("BirthDate", "2023-03-01");
    const schemaElement: XSDElement = { name: "BirthDate", type: "xs:date" };
    const errors = validateType(node, schemaElement);
    expect(errors).toEqual([]);
  });

  it("should validate xs:date - fail", () => {
    const node = createElementWithText("BirthDate", "March 1, 2023");
    const schemaElement: XSDElement = { name: "BirthDate", type: "xs:date" };
    const errors = validateType(node, schemaElement);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/must be a valid date/);
  });

  describe("numeric constraints", () => {
    it("should pass when value satisfies minInclusive", () => {
      const node = createElementWithText("Score", "5");
      const schema: XSDElement = { name: "Score", type: "xs:integer", minInclusive: 5 };
      expect(validateType(node, schema)).toEqual([]);
    });

    it("should fail when value is below minInclusive", () => {
      const node = createElementWithText("Score", "4");
      const schema: XSDElement = { name: "Score", type: "xs:integer", minInclusive: 5 };
      const errors = validateType(node, schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RANGE_VIOLATION");
      expect(errors[0].message).toMatch(/greater than or equal to 5/);
    });

    it("should pass when value satisfies maxInclusive", () => {
      const node = createElementWithText("Score", "10");
      const schema: XSDElement = { name: "Score", type: "xs:integer", maxInclusive: 10 };
      expect(validateType(node, schema)).toEqual([]);
    });

    it("should fail when value exceeds maxInclusive", () => {
      const node = createElementWithText("Score", "11");
      const schema: XSDElement = { name: "Score", type: "xs:integer", maxInclusive: 10 };
      const errors = validateType(node, schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RANGE_VIOLATION");
      expect(errors[0].message).toMatch(/less than or equal to 10/);
    });

    it("should fail when value equals minExclusive boundary", () => {
      const node = createElementWithText("Score", "0");
      const schema: XSDElement = { name: "Score", type: "xs:integer", minExclusive: 0 };
      const errors = validateType(node, schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RANGE_VIOLATION");
      expect(errors[0].message).toMatch(/greater than 0/);
    });

    it("should fail when value equals maxExclusive boundary", () => {
      const node = createElementWithText("Score", "100");
      const schema: XSDElement = { name: "Score", type: "xs:integer", maxExclusive: 100 };
      const errors = validateType(node, schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RANGE_VIOLATION");
      expect(errors[0].message).toMatch(/less than 100/);
    });

    it("should accumulate multiple numeric constraint violations", () => {
      const node = createElementWithText("Score", "-5");
      const schema: XSDElement = {
        name: "Score",
        type: "xs:integer",
        minInclusive: 0,
        maxInclusive: 100,
      };
      const errors = validateType(node, schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RANGE_VIOLATION");
    });

    it("should work with xs:decimal and minInclusive + maxExclusive together", () => {
      const node = createElementWithText("Rate", "0.5");
      const schema: XSDElement = {
        name: "Rate",
        type: "xs:decimal",
        minInclusive: 0,
        maxExclusive: 1,
      };
      expect(validateType(node, schema)).toEqual([]);
    });

    it("should skip numeric constraints when the value fails type validation", () => {
      // 'abc' fails xs:integer type check; numeric constraints should not add extra errors
      const node = createElementWithText("Score", "abc");
      const schema: XSDElement = {
        name: "Score",
        type: "xs:integer",
        minInclusive: 0,
        maxInclusive: 100,
      };
      const errors = validateType(node, schema);
      // Only one type mismatch error, not additional range errors
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("TYPE_MISMATCH");
    });
  });

  it("should surface an invalid regex pattern as an error", () => {
    const node = createElementWithText("Code", "ABC");
    const schema: XSDElement = { name: "Code", type: "xs:string", pattern: "[invalid(" };
    const errors = validateType(node, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("PATTERN_MISMATCH");
    expect(errors[0].message).toMatch(/invalid pattern/);
  });

  it("should fail when xs:length constraint is violated", () => {
    const node = createElementWithText("Code", "AB");
    const schema: XSDElement = { name: "Code", type: "xs:string", length: 5 };
    const errors = validateType(node, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("RANGE_VIOLATION");
    expect(errors[0].message).toMatch(/exactly 5 characters/);
  });

  it("should pass when value length matches xs:length exactly", () => {
    const node = createElementWithText("Code", "ABCDE");
    const schema: XSDElement = { name: "Code", type: "xs:string", length: 5 };
    expect(validateType(node, schema)).toEqual([]);
  });

  it("should fail when xs:totalDigits constraint is exceeded", () => {
    const node = createElementWithText("Price", "1234.56");
    const schema: XSDElement = { name: "Price", type: "xs:decimal", totalDigits: 5 };
    const errors = validateType(node, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("RANGE_VIOLATION");
    expect(errors[0].message).toMatch(/total digits/);
  });

  it("should fail when xs:fractionDigits constraint is exceeded", () => {
    const node = createElementWithText("Price", "3.14159");
    const schema: XSDElement = { name: "Price", type: "xs:decimal", fractionDigits: 2 };
    const errors = validateType(node, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("RANGE_VIOLATION");
    expect(errors[0].message).toMatch(/fraction digits/);
  });

  it("should pass valid decimal within totalDigits and fractionDigits constraints", () => {
    const node = createElementWithText("Price", "123.45");
    const schema: XSDElement = {
      name: "Price",
      type: "xs:decimal",
      totalDigits: 6,
      fractionDigits: 2,
    };
    expect(validateType(node, schema)).toEqual([]);
  });
});
