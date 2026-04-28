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

  describe("xs:list validation", () => {
    it("should pass valid list of integers", () => {
      const node = createElementWithText("Scores", "1 2 3 42");
      const schema: XSDElement = { name: "Scores", listItemType: "xs:integer" };
      expect(validateType(node, schema)).toEqual([]);
    });

    it("should fail when a list item fails its type", () => {
      const node = createElementWithText("Scores", "1 abc 3");
      const schema: XSDElement = { name: "Scores", listItemType: "xs:integer" };
      const errors = validateType(node, schema);
      expect(errors.length).toBe(1);
      expect(errors[0].code).toBe("TYPE_MISMATCH");
      expect(errors[0].message).toMatch(/abc/);
    });

    it("should pass an empty list", () => {
      const node = createElementWithText("Scores", "");
      const schema: XSDElement = { name: "Scores", listItemType: "xs:integer" };
      expect(validateType(node, schema)).toEqual([]);
    });

    it("should report multiple invalid list items", () => {
      const node = createElementWithText("Tags", "valid1 1invalid 2alsoInvalid");
      const schema: XSDElement = { name: "Tags", listItemType: "xs:NCName" };
      const errors = validateType(node, schema);
      expect(errors.length).toBe(2);
    });
  });

  describe("xs:union validation", () => {
    it("should pass when value matches first member type", () => {
      const node = createElementWithText("Value", "42");
      const schema: XSDElement = { name: "Value", unionMemberTypes: ["xs:integer", "xs:string"] };
      expect(validateType(node, schema)).toEqual([]);
    });

    it("should pass when value matches second member type", () => {
      const node = createElementWithText("Value", "hello");
      const schema: XSDElement = { name: "Value", unionMemberTypes: ["xs:integer", "xs:string"] };
      expect(validateType(node, schema)).toEqual([]);
    });

    it("should fail when value matches no member type", () => {
      const node = createElementWithText("Value", "not-a-date");
      const schema: XSDElement = {
        name: "Value",
        unionMemberTypes: ["xs:integer", "xs:date"],
      };
      const errors = validateType(node, schema);
      expect(errors.length).toBe(1);
      expect(errors[0].code).toBe("TYPE_MISMATCH");
    });

    it("should pass when value is valid for one of multiple numeric types", () => {
      const node = createElementWithText("Num", "2023-01-01");
      const schema: XSDElement = {
        name: "Num",
        unionMemberTypes: ["xs:integer", "xs:date"],
      };
      expect(validateType(node, schema)).toEqual([]);
    });
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

  describe("additional built-in types", () => {
    it.each([
      ["xs:long", "9223372036854775807", true],
      ["xs:long", "not-a-number", false],
      ["xs:int", "2147483647", true],
      ["xs:int", "2147483648", false],
      ["xs:int", "-2147483648", true],
      ["xs:short", "32767", true],
      ["xs:short", "32768", false],
      ["xs:byte", "127", true],
      ["xs:byte", "128", false],
      ["xs:byte", "-128", true],
      ["xs:unsignedLong", "0", true],
      ["xs:unsignedLong", "-1", false],
      ["xs:unsignedInt", "4294967295", true],
      ["xs:unsignedInt", "4294967296", false],
      ["xs:unsignedShort", "65535", true],
      ["xs:unsignedShort", "65536", false],
      ["xs:unsignedByte", "255", true],
      ["xs:unsignedByte", "256", false],
      ["xs:nonNegativeInteger", "0", true],
      ["xs:nonNegativeInteger", "-1", false],
      ["xs:positiveInteger", "1", true],
      ["xs:positiveInteger", "0", false],
      ["xs:negativeInteger", "-1", true],
      ["xs:negativeInteger", "0", false],
      ["xs:nonPositiveInteger", "0", true],
      ["xs:nonPositiveInteger", "1", false],
      ["xs:dateTime", "2023-01-01T12:00:00", true],
      ["xs:dateTime", "2023-01-01T12:00:00Z", true],
      ["xs:dateTime", "2023-01-01T12:00:00+05:30", true],
      ["xs:dateTime", "2023-01-01", false],
      ["xs:time", "12:00:00", true],
      ["xs:time", "12:00:00Z", true],
      ["xs:time", "not-a-time", false],
      ["xs:anyURI", "http://example.com", true],
      ["xs:normalizedString", "hello world", true],
      ["xs:normalizedString", "hello\tworld", false],
      ["xs:token", "hello world", true],
      ["xs:token", "hello\tworld", false],
      ["xs:token", "double  space", false],
      ["xs:NMTOKEN", "valid-token", true],
      ["xs:NMTOKEN", "invalid token", false],
      ["xs:NCName", "validName", true],
      ["xs:NCName", "1invalid", false],
      ["xs:NCName", "invalid:name", false],
    ])("type %s with value '%s' → valid: %s", (type: string, value: string, valid: boolean) => {
      const node = createElementWithText("Field", value);
      const schema: XSDElement = { name: "Field", type };
      const errors = validateType(node, schema);
      if (valid) {
        expect(errors).toEqual([]);
      } else {
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].code).toBe("TYPE_MISMATCH");
      }
    });
  });
});
