import { validateConstraints } from "@lib/validator/pipeline/steps/constraints";
import { XSDElement } from "@lib/types/xsd";

describe("validateConstraints step", () => {
  let parser: DOMParser;

  beforeEach(() => {
    parser = new DOMParser();
  });

  function createElementWithText(tagName: string, text: string): Element | null {
    const xml = `<${tagName}>${text}</${tagName}>`;
    return parser.parseFromString(xml, "application/xml").documentElement;
  }

  it("should apply pattern to non-string types (xs:integer)", () => {
    const node = createElementWithText("Count", "abc"); // fails pattern
    const schema: XSDElement = {
      name: "Count",
      type: "xs:integer",
      pattern: "^\\d+$",
    };
    const errors = validateConstraints(node!, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("PATTERN_MISMATCH");
  });

  it("should skip validation if no pattern/minLength/maxLength is set", () => {
    const node = createElementWithText("Test", "any content");
    const schema: XSDElement = {
      name: "Test",
      type: "xs:string",
      // no pattern, no minLength, no maxLength
    };
    const errors = validateConstraints(node!, schema);
    expect(errors).toEqual([]);
  });

  it("should apply length constraints to non-string types when set", () => {
    const node = createElementWithText("Test", "abc");
    const schema: XSDElement = {
      name: "Test",
      type: "xs:integer",
      minLength: 2,
      maxLength: 5,
    };
    // length = 3 — within bounds, no errors
    const errors = validateConstraints(node!, schema);
    expect(errors).toHaveLength(0);
  });

  it("should enforce pattern correctly - success case", () => {
    const node = createElementWithText("Username", "abc_123");
    const schema: XSDElement = {
      name: "Username",
      type: "xs:string",
      pattern: "^[A-Za-z0-9_]+$",
    };
    const errors = validateConstraints(node!, schema);
    expect(errors).toEqual([]);
  });

  it("should enforce pattern correctly - failure case", () => {
    const node = createElementWithText("Username", "abc-123"); // has a dash
    const schema: XSDElement = {
      name: "Username",
      type: "xs:string",
      pattern: "^[A-Za-z0-9_]+$",
    };
    const errors = validateConstraints(node!, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/does not match the pattern/);
  });

  it("should enforce minLength - success case", () => {
    const node = createElementWithText("Code", "abcd");
    const schema: XSDElement = {
      name: "Code",
      type: "xs:string",
      minLength: 3,
    };
    // length = 4 => OK
    const errors = validateConstraints(node!, schema);
    expect(errors).toHaveLength(0);
  });

  it("should enforce minLength - failure case", () => {
    const node = createElementWithText("Code", "ab");
    const schema: XSDElement = {
      name: "Code",
      type: "xs:string",
      minLength: 3,
    };
    // length = 2 => fail
    const errors = validateConstraints(node!, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/must be at least length 3/);
  });

  it("should enforce maxLength - success case", () => {
    const node = createElementWithText("Password", "1234");
    const schema: XSDElement = {
      name: "Password",
      type: "xs:string",
      maxLength: 5,
    };
    // length = 4 => OK
    const errors = validateConstraints(node!, schema);
    expect(errors).toHaveLength(0);
  });

  it("should enforce maxLength - failure case", () => {
    const node = createElementWithText("Password", "123456");
    const schema: XSDElement = {
      name: "Password",
      type: "xs:string",
      maxLength: 5,
    };
    // length = 6 => fail
    const errors = validateConstraints(node!, schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/must be at most length 5/);
  });

  it("should combine pattern and length checks - multiple failures", () => {
    const node = createElementWithText("Token", "invalid-content-withdash");
    const schema: XSDElement = {
      name: "Token",
      type: "xs:string",
      pattern: "^[A-Za-z0-9]+$",
      minLength: 5,
      maxLength: 10,
    };
    // There's a dash => fails pattern
    // length is 24 => fails maxLength
    const errors = validateConstraints(node!, schema);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toMatch(/does not match the pattern/);
    expect(errors[1].message).toMatch(/must be at most length 10/);
  });
});
