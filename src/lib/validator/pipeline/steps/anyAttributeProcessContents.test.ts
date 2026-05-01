import { Checkr } from "@lib/core/main";

describe("xs:anyAttribute processContents", () => {
  function validate(xml: string, xsd: string) {
    return new Checkr().validate(xml, xsd);
  }

  const strictSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="root">
        <xs:complexType>
          <xs:sequence/>
          <xs:attribute name="known" type="xs:string"/>
          <xs:anyAttribute processContents="strict"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  const laxSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="root">
        <xs:complexType>
          <xs:anyAttribute processContents="lax"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  const skipSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="root">
        <xs:complexType>
          <xs:anyAttribute processContents="skip"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  describe("processContents='strict'", () => {
    it("allows a declared attribute", () => {
      expect(validate(`<root known="hello"/>`, strictSchema).valid).toBe(true);
    });

    it("rejects an undeclared attribute", () => {
      const result = validate(`<root unknown="x"/>`, strictSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "ATTRIBUTE_INVALID")).toBe(true);
    });
  });

  describe("processContents='lax'", () => {
    it("allows declared attributes", () => {
      expect(validate(`<root myAttr="x"/>`, laxSchema).valid).toBe(true);
    });

    it("allows undeclared attributes silently", () => {
      expect(validate(`<root randomAttr="val"/>`, laxSchema).valid).toBe(true);
    });
  });

  describe("processContents='skip'", () => {
    it("allows any attribute without validation", () => {
      expect(validate(`<root whatever="x"/>`, skipSchema).valid).toBe(true);
    });
  });

  describe("processContents default (no attribute)", () => {
    const noAttrSchema = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="root">
          <xs:complexType>
            <xs:anyAttribute/>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    it("defaults to skip behaviour — allows any attribute", () => {
      expect(validate(`<root anything="x"/>`, noAttrSchema).valid).toBe(true);
    });
  });
});
