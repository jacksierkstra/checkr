import { Checkr } from "@lib/core/main";

describe("xs:any processContents", () => {
  function validate(xml: string, xsd: string) {
    return new Checkr().validate(xml, xsd);
  }

  const strictSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="known" type="xs:string"/>
      <xs:element name="root">
        <xs:complexType>
          <xs:any processContents="strict"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  const laxSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="known" type="xs:integer"/>
      <xs:element name="root">
        <xs:complexType>
          <xs:any processContents="lax"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  const skipSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="root">
        <xs:complexType>
          <xs:any processContents="skip"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  describe("processContents='strict'", () => {
    it("allows a declared element", () => {
      expect(validate(`<root><known>hello</known></root>`, strictSchema).valid).toBe(true);
    });

    it("rejects an undeclared element", () => {
      const result = validate(`<root><unknown>x</unknown></root>`, strictSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
    });

    it("validates declared element content against its type", () => {
      // known is xs:string — anything is valid
      expect(validate(`<root><known>any text</known></root>`, strictSchema).valid).toBe(true);
    });
  });

  describe("processContents='lax'", () => {
    it("allows a declared element with valid content", () => {
      expect(validate(`<root><known>42</known></root>`, laxSchema).valid).toBe(true);
    });

    it("validates declared element content (rejects type mismatch)", () => {
      const result = validate(`<root><known>not-an-integer</known></root>`, laxSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "TYPE_MISMATCH")).toBe(true);
    });

    it("allows an undeclared element silently", () => {
      expect(validate(`<root><unknown>x</unknown></root>`, laxSchema).valid).toBe(true);
    });
  });

  describe("processContents='skip'", () => {
    it("allows any element without validation", () => {
      expect(validate(`<root><whatever>x</whatever></root>`, skipSchema).valid).toBe(true);
    });
  });

  describe("processContents default (no attribute)", () => {
    const noAttrSchema = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="root">
          <xs:complexType>
            <xs:any/>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    it("defaults to skip behaviour — allows any element", () => {
      expect(validate(`<root><anything>x</anything></root>`, noAttrSchema).valid).toBe(true);
    });
  });
});
