import { Checkr } from "@lib/core/main";

describe("xs:sequence group-level occurrence", () => {
  function validate(xml: string, xsd: string) {
    return new Checkr().validate(xml, xsd);
  }

  const optionalSeqSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="root">
        <xs:complexType>
          <xs:sequence minOccurs="0" maxOccurs="1">
            <xs:element name="street" type="xs:string"/>
            <xs:element name="city" type="xs:string"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  it("allows empty element when sequence minOccurs=0", () => {
    expect(validate(`<root/>`, optionalSeqSchema).valid).toBe(true);
  });

  it("allows a complete sequence when minOccurs=0, maxOccurs=1", () => {
    const xml = `<root><street>Main St</street><city>Springfield</city></root>`;
    expect(validate(xml, optionalSeqSchema).valid).toBe(true);
  });
});

describe("xs:choice group-level occurrence", () => {
  function validate(xml: string, xsd: string) {
    return new Checkr().validate(xml, xsd);
  }

  const multiChoiceSchema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="root">
        <xs:complexType>
          <xs:choice minOccurs="2" maxOccurs="unbounded">
            <xs:element name="a" type="xs:string"/>
            <xs:element name="b" type="xs:string"/>
          </xs:choice>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  it("allows exactly 2 choice elements when minOccurs=2", () => {
    const xml = `<root><a>x</a><b>y</b></root>`;
    expect(validate(xml, multiChoiceSchema).valid).toBe(true);
  });

  it("allows more than 2 choice elements when maxOccurs=unbounded", () => {
    const xml = `<root><a>x</a><b>y</b><a>z</a></root>`;
    expect(validate(xml, multiChoiceSchema).valid).toBe(true);
  });

  it("rejects fewer than minOccurs choices", () => {
    const xml = `<root><a>x</a></root>`;
    const result = validate(xml, multiChoiceSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "CHOICE_VIOLATION")).toBe(true);
  });
});
