import { Checkr } from "@lib/core/main";

const checkr = new Checkr();

describe("xs:substitutionGroup support", () => {
  const schema = `
    <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
      <xs:element name="address">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="street" type="xs:string"/>
            <xs:element name="city" type="xs:string"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>

      <xs:element name="usAddress" substitutionGroup="address">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="street" type="xs:string"/>
            <xs:element name="city" type="xs:string"/>
            <xs:element name="state" type="xs:string"/>
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

  it("accepts the head element itself", () => {
    const xml = `
      <person>
        <name>Alice</name>
        <address><street>1 Main</street><city>Springfield</city></address>
      </person>
    `;
    expect(checkr.validate(xml, schema).valid).toBe(true);
  });

  it("accepts a substitute element in place of the head", () => {
    const xml = `
      <person>
        <name>Alice</name>
        <usAddress>
          <street>1 Main</street>
          <city>Springfield</city>
          <state>IL</state>
        </usAddress>
      </person>
    `;
    const result = checkr.validate(xml, schema);
    expect(result.valid).toBe(true);
  });

  it("rejects an unrelated element that is not in the substitution group", () => {
    const xml = `
      <person>
        <name>Alice</name>
        <foreignAddress><street>1 Main</street></foreignAddress>
      </person>
    `;
    const result = checkr.validate(xml, schema);
    expect(result.valid).toBe(false);
  });

  it("reports missing required element even with substitution group declared", () => {
    const xml = `<person><name>Alice</name></person>`;
    const result = checkr.validate(xml, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT")).toBe(true);
  });

  it("handles transitive substitution chains (A subs B subs C)", () => {
    const transitiveSchema = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="base" type="xs:string"/>
        <xs:element name="derived" type="xs:string" substitutionGroup="base"/>
        <xs:element name="moreDerived" type="xs:string" substitutionGroup="derived"/>

        <xs:element name="container">
          <xs:complexType>
            <xs:sequence>
              <xs:element ref="base"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;

    // "base" itself
    expect(checkr.validate(`<container><base>x</base></container>`, transitiveSchema).valid).toBe(true);
    // direct substitute
    expect(checkr.validate(`<container><derived>x</derived></container>`, transitiveSchema).valid).toBe(true);
    // transitive substitute
    expect(checkr.validate(`<container><moreDerived>x</moreDerived></container>`, transitiveSchema).valid).toBe(true);
    // unrelated element
    expect(checkr.validate(`<container><other>x</other></container>`, transitiveSchema).valid).toBe(false);
  });
});
