import { Checkr } from "@lib/core/main";

describe("xs:notation declaration", () => {
  function validate(xml: string, xsd: string) {
    return new Checkr().validate(xml, xsd);
  }

  const schemaWithNotations = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:notation name="jpeg" public="image/jpeg"/>
      <xs:notation name="png" public="image/png"/>
      <xs:element name="image">
        <xs:complexType>
          <xs:attribute name="format" type="xs:NOTATION"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  const schemaWithoutNotations = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="image">
        <xs:complexType>
          <xs:attribute name="format" type="xs:NOTATION"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  describe("when notations are declared", () => {
    it("allows a declared notation value", () => {
      expect(validate(`<image format="jpeg"/>`, schemaWithNotations).valid).toBe(true);
    });

    it("allows another declared notation value", () => {
      expect(validate(`<image format="png"/>`, schemaWithNotations).valid).toBe(true);
    });

    it("rejects an undeclared notation value", () => {
      const result = validate(`<image format="gif"/>`, schemaWithNotations);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "ATTRIBUTE_INVALID")).toBe(true);
    });

    it("element is valid when no format attribute is present (optional)", () => {
      expect(validate(`<image/>`, schemaWithNotations).valid).toBe(true);
    });
  });

  describe("when no notations are declared", () => {
    it("allows any QName value (no notation list to check against)", () => {
      expect(validate(`<image format="gif"/>`, schemaWithoutNotations).valid).toBe(true);
    });

    it("rejects an invalid QName value", () => {
      const result = validate(`<image format="123invalid"/>`, schemaWithoutNotations);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "ATTRIBUTE_INVALID")).toBe(true);
    });
  });
});
