import { isValidBuiltinType } from "@lib/validator/builtinTypeCheck";

describe("isValidBuiltinType", () => {
  it.each([
    ["xs:string", "anything", true],
    ["xs:boolean", "true", true],
    ["xs:boolean", "yes", false],
    ["xs:integer", "42", true],
    ["xs:integer", "3.14", false],
    ["xs:decimal", "3.14", true],
    ["xs:decimal", "abc", false],
    ["xs:date", "2024-01-15", true],
    ["xs:date", "24-01-15", false],
    ["xs:dateTime", "2024-01-15T10:30:00Z", true],
    ["xs:dateTime", "2024-01-15", false],
    ["xs:time", "10:30:00", true],
    ["xs:time", "abc", false],
    ["xs:NCName", "valid", true],
    ["xs:NCName", "1invalid", false],
    ["xs:ID", "myId", true],
    ["xs:ID", "123bad", false],
    ["xs:IDREF", "ref1", true],
    ["xs:IDREF", "-bad", false],
    ["xs:IDREFS", "ref1 ref2", true],
    ["xs:IDREFS", "ref1 123bad", false],
    ["xs:IDREFS", "", false],
    ["xs:ENTITY", "myEntity", true],
    ["xs:ENTITY", "bad entity", false],
    ["xs:ENTITIES", "e1 e2", true],
    ["xs:ENTITIES", "", false],
    ["xs:QName", "myName", true],
    ["xs:QName", "ns:myName", true],
    ["xs:QName", "123:bad", false],
    ["xs:NOTATION", "ns:notation", true],
    ["xs:NOTATION", "123bad", false],
    ["xs:language", "en-GB", true],
    ["xs:language", "not valid!", false],
    ["xs:hexBinary", "DEADBEEF", true],
    ["xs:hexBinary", "DEF", false],
    ["xs:base64Binary", "SGVsbG8=", true],
    ["xs:base64Binary", "!!!", false],
    ["xs:unknownCustomType", "any value", true],
  ])(
    "isValidBuiltinType(%s, %s) === %s",
    (type: string, value: string, expected: boolean) => {
      expect(isValidBuiltinType(value, type)).toBe(expected);
    },
  );
});
