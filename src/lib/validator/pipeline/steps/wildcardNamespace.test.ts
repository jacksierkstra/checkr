import { Checkr } from "@lib/core/main";

describe("xs:any namespace constraint", () => {
  function validate(xml: string, xsd: string) {
    return new Checkr().validate(xml, xsd);
  }

  const localOnlySchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="root">
        <xs:complexType>
          <xs:any namespace="##local" processContents="skip"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  const specificNsSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="root">
        <xs:complexType>
          <xs:any namespace="http://example.com" processContents="skip"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  describe("namespace='##local'", () => {
    it("allows a no-namespace element", () => {
      expect(validate(`<root><local/></root>`, localOnlySchema).valid).toBe(true);
    });

    it("rejects a namespaced element", () => {
      const xml = `<root xmlns:ex="http://example.com"><ex:namespaced/></root>`;
      const result = validate(xml, localOnlySchema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
    });
  });

  describe("namespace='specific URI'", () => {
    it("allows an element in the specified namespace", () => {
      const xml = `<root xmlns:ex="http://example.com"><ex:thing/></root>`;
      expect(validate(xml, specificNsSchema).valid).toBe(true);
    });

    it("rejects an element in a different namespace", () => {
      const xml = `<root xmlns:other="http://other.com"><other:thing/></root>`;
      const result = validate(xml, specificNsSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
    });

    it("rejects a no-namespace element", () => {
      const result = validate(`<root><local/></root>`, specificNsSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
    });
  });
});

describe("xs:anyAttribute namespace constraint", () => {
  function validate(xml: string, xsd: string) {
    return new Checkr().validate(xml, xsd);
  }

  const localAttrSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="root">
        <xs:complexType>
          <xs:anyAttribute namespace="##local" processContents="skip"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  describe("namespace='##local'", () => {
    it("allows an attribute with no namespace", () => {
      expect(validate(`<root local="x"/>`, localAttrSchema).valid).toBe(true);
    });

    it("rejects a namespaced attribute", () => {
      const xml = `<root xmlns:ex="http://example.com" ex:nsAttr="x"/>`;
      const result = validate(xml, localAttrSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "ATTRIBUTE_INVALID")).toBe(true);
    });
  });
});
