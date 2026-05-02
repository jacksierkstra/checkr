import { isValidBuiltinType } from "@lib/validator/builtinTypeCheck";

describe("isValidBuiltinType", () => {
  it.each([
    ["xs:string", "anything", true],
    ["xs:boolean", "true", true],
    ["xs:boolean", "yes", false],
    ["xs:integer", "42", true],
    ["xs:integer", "3.14", false],
    // xs:decimal — sign, leading zeros, dot-only forms (§3.2.3)
    ["xs:decimal", "3.14", true],
    ["xs:decimal", "-3.14", true],
    ["xs:decimal", "+1.5", true],
    ["xs:decimal", ".5", true],
    ["xs:decimal", "001.23", true],
    ["xs:decimal", "1.500", true],
    ["xs:decimal", "abc", false],
    ["xs:decimal", "1E2", false], // scientific notation not valid for xs:decimal
    // xs:float / xs:double — IEEE 754 specials (§3.2.4–3.2.5)
    ["xs:float", "3.14", true],
    ["xs:float", "+3.14", true],
    ["xs:float", "INF", true],
    ["xs:float", "-INF", true],
    ["xs:float", "NaN", true],
    ["xs:float", "inf", false], // case-sensitive
    ["xs:float", "nan", false],
    ["xs:double", "INF", true],
    ["xs:double", "-INF", true],
    ["xs:double", "NaN", true],
    ["xs:double", "1.5E10", true],
    // xs:date — optional timezone (§3.2.9)
    ["xs:date", "2024-01-15", true],
    ["xs:date", "2024-01-15Z", true],
    ["xs:date", "2024-01-15+05:30", true],
    ["xs:date", "2024-01-15-08:00", true],
    ["xs:date", "24-01-15", false],
    ["xs:dateTime", "2024-01-15T10:30:00Z", true],
    ["xs:dateTime", "2024-01-15", false],
    ["xs:time", "10:30:00", true],
    ["xs:time", "abc", false],
    // xs:duration — bare T must be rejected (§3.2.6)
    ["xs:duration", "P1Y", true],
    ["xs:duration", "PT1H", true],
    ["xs:duration", "P1Y2M3DT4H5M6.789S", true],
    ["xs:duration", "-P1M", true],
    ["xs:duration", "P", false],
    ["xs:duration", "-P", false],
    ["xs:duration", "PT", false], // T with no time fields
    // xs:gYear timezone offset range (§3.2.10)
    ["xs:gYear", "2024", true],
    ["xs:gYear", "2024Z", true],
    ["xs:gYear", "2024+14:00", true],
    ["xs:gYear", "2024+15:00", false], // offset out of range
    // xs:gMonthDay
    ["xs:gMonthDay", "--01-15", true],
    ["xs:gMonthDay", "--01-15Z", true],
    ["xs:gMonthDay", "--01-15+25:00", false], // offset out of range
    ["xs:NCName", "valid", true],
    ["xs:NCName", "1invalid", false],
    // xs:long — 64-bit signed range
    ["xs:long", "0", true],
    ["xs:long", "9223372036854775807", true],   // INT64_MAX
    ["xs:long", "-9223372036854775808", true],  // INT64_MIN
    ["xs:long", "9223372036854775808", false],  // INT64_MAX + 1
    ["xs:long", "-9223372036854775809", false], // INT64_MIN - 1
    ["xs:long", "3.14", false],
    // xs:unsignedLong — 64-bit unsigned range
    ["xs:unsignedLong", "0", true],
    ["xs:unsignedLong", "18446744073709551615", true],  // UINT64_MAX
    ["xs:unsignedLong", "18446744073709551616", false], // UINT64_MAX + 1
    ["xs:unsignedLong", "-1", false],
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
