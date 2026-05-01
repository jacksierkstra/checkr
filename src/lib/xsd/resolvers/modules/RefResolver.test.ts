import { Checkr } from "@lib/core/main";

describe("xs:element ref= support", () => {
  function validate(xml: string, xsd: string) {
    return new Checkr().validate(xml, xsd);
  }

  const schemaWithRef = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="address">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="street" type="xs:string"/>
            <xs:element name="city" type="xs:string"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>

      <xs:element name="person">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="name" type="xs:string"/>
            <xs:element ref="address"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  it("validates a valid document with a ref child", () => {
    const xml = `
      <person>
        <name>Alice</name>
        <address>
          <street>123 Main St</street>
          <city>Springfield</city>
        </address>
      </person>
    `;
    const result = validate(xml, schemaWithRef);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports missing required ref child", () => {
    const xml = `
      <person>
        <name>Alice</name>
      </person>
    `;
    const result = validate(xml, schemaWithRef);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.element === "address")).toBe(true);
  });

  it("reports validation error inside a ref child (wrong child type)", () => {
    const xml = `
      <person>
        <name>Alice</name>
        <address>
          <street>123 Main St</street>
          <!-- city is missing -->
        </address>
      </person>
    `;
    const result = validate(xml, schemaWithRef);
    expect(result.valid).toBe(false);
  });

  it("respects minOccurs=0 on a ref element", () => {
    const schema = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="note" type="xs:string"/>

        <xs:element name="person">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="name" type="xs:string"/>
              <xs:element ref="note" minOccurs="0"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    const xmlWithout = `<person><name>Alice</name></person>`;
    const xmlWith = `<person><name>Alice</name><note>hello</note></person>`;
    expect(validate(xmlWithout, schema).valid).toBe(true);
    expect(validate(xmlWith, schema).valid).toBe(true);
  });

  it("allows multiple occurrences of a ref element with maxOccurs=unbounded", () => {
    const schema = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="tag" type="xs:string"/>

        <xs:element name="item">
          <xs:complexType>
            <xs:sequence>
              <xs:element ref="tag" maxOccurs="unbounded"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    const xml = `<item><tag>a</tag><tag>b</tag><tag>c</tag></item>`;
    expect(validate(xml, schema).valid).toBe(true);
  });
});

describe("xs:attribute ref= support", () => {
  function validate(xml: string, xsd: string) {
    return new Checkr().validate(xml, xsd);
  }

  const schemaWithAttrRef = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:attribute name="lang" type="xs:language"/>

      <xs:element name="text">
        <xs:complexType>
          <xs:attribute ref="lang"/>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  `;

  it("allows valid attribute value when ref is resolved", () => {
    const xml = `<text lang="en"/>`;
    expect(validate(xml, schemaWithAttrRef).valid).toBe(true);
  });

  it("inherits required use from global attribute declaration", () => {
    const schemaRequired = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:attribute name="id" type="xs:integer" use="required"/>

        <xs:element name="item">
          <xs:complexType>
            <xs:attribute ref="id"/>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    expect(validate(`<item/>`, schemaRequired).valid).toBe(false);
    expect(validate(`<item id="42"/>`, schemaRequired).valid).toBe(true);
  });

  it("inherits facets (enumeration) from global attribute declaration", () => {
    const schemaEnum = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:attribute name="status">
          <xs:simpleType>
            <xs:restriction base="xs:string">
              <xs:enumeration value="active"/>
              <xs:enumeration value="inactive"/>
            </xs:restriction>
          </xs:simpleType>
        </xs:attribute>

        <xs:element name="user">
          <xs:complexType>
            <xs:attribute ref="status"/>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    expect(validate(`<user status="active"/>`, schemaEnum).valid).toBe(true);
    const bad = validate(`<user status="deleted"/>`, schemaEnum);
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.code === "PATTERN_MISMATCH")).toBe(true);
  });
});
