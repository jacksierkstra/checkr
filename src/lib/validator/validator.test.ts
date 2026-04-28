import { Validator, ValidatorImpl } from "@lib/validator/validator";
import { XMLParserImpl } from "@lib/xml/parser";
import { XSDPipelineParserImpl } from "@lib/xsd/pipeline/parser";

describe("Validator", () => {
  let validator: Validator;

  beforeAll(() => {
    const xmlParser = new XMLParserImpl();
    const xsdParser = new XSDPipelineParserImpl(xmlParser);
    validator = new ValidatorImpl(xmlParser, xsdParser);
  });

  it("should validate XML according to XSD schema - success case", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Person" type="xs:string" minOccurs="1" maxOccurs="1"/>
      </xs:schema>
    `;
    const xml = `<Person>John Doe</Person>`;
    const result = validator.validate(xml, xsd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail validation when required element is missing", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Person" type="xs:string" minOccurs="1" maxOccurs="1"/>
      </xs:schema>
    `;
    const xml = `<NotPerson>Jane Doe</NotPerson>`;
    const result = validator.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/Person/);
  });

  it("should validate xs:integer type correctly", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Age" type="xs:integer" minOccurs="1" maxOccurs="1"/>
      </xs:schema>
    `;
    const xmlValid = `<Age>30</Age>`;
    const resultValid = validator.validate(xmlValid, xsd);
    expect(resultValid.valid).toBe(true);

    const xmlInvalid = `<Age>thirty</Age>`;
    const resultInvalid = validator.validate(xmlInvalid, xsd);
    expect(resultInvalid.valid).toBe(false);
    expect(resultInvalid.errors[0].message).toMatch(/must be an integer|not a valid integer/);
  });

  it("should validate xs:date type correctly", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="BirthDate" type="xs:date" minOccurs="1" maxOccurs="1"/>
      </xs:schema>
    `;
    const xmlValid = `<BirthDate>1990-05-20</BirthDate>`;
    const resultValid = validator.validate(xmlValid, xsd);
    expect(resultValid.valid).toBe(true);

    const xmlInvalid = `<BirthDate>May 20, 1990</BirthDate>`;
    const resultInvalid = validator.validate(xmlInvalid, xsd);
    expect(resultInvalid.valid).toBe(false);
    expect(resultInvalid.errors[0].message).toMatch(/must be a valid date/);
  });

  it("should validate enumerated values correctly", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Status" type="xs:string">
          <xs:simpleType>
            <xs:restriction base="xs:string">
              <xs:enumeration value="Pending"/>
              <xs:enumeration value="Approved"/>
              <xs:enumeration value="Rejected"/>
            </xs:restriction>
          </xs:simpleType>
        </xs:element>
      </xs:schema>
    `;
    const xmlValid = `<Status>Approved</Status>`;
    const resultValid = validator.validate(xmlValid, xsd);
    expect(resultValid.valid).toBe(true);

    const xmlInvalid = `<Status>InvalidValue</Status>`;
    const resultInvalid = validator.validate(xmlInvalid, xsd);
    expect(resultInvalid.valid).toBe(false);
    expect(resultInvalid.errors[0].message).toMatch(/must be one of/);
  });

  it("should validate fixed attribute values", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Item">
          <xs:attribute name="category" type="xs:string" fixed="electronics"/>
        </xs:element>
      </xs:schema>
    `;
    const xmlInvalid = `<Item category="books"/>`;
    const resultInvalid = validator.validate(xmlInvalid, xsd);
    expect(resultInvalid.valid).toBe(false);
    expect(resultInvalid.errors[0].message).toMatch(/must be fixed to 'electronics'/);
  });

  it("should validate choice elements (Email only)", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="ContactInfo">
          <xs:complexType>
            <xs:sequence>
              <xs:choice>
                <xs:element name="Email" type="xs:string"/>
                <xs:element name="Phone" type="xs:string"/>
              </xs:choice>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    const xml = `
      <ContactInfo>
        <Email>user@example.com</Email>
      </ContactInfo>
    `;
    const result = validator.validate(xml, xsd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should validate choice elements (Phone only)", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="ContactInfo">
          <xs:complexType>
            <xs:sequence>
              <xs:choice>
                <xs:element name="Email" type="xs:string"/>
                <xs:element name="Phone" type="xs:string"/>
              </xs:choice>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    const xml = `
      <ContactInfo>
        <Phone>123-456-7890</Phone>
      </ContactInfo>
    `;
    const result = validator.validate(xml, xsd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail when both choices are present", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="ContactInfo">
          <xs:complexType>
            <xs:sequence>
              <xs:choice>
                <xs:element name="Email" type="xs:string"/>
                <xs:element name="Phone" type="xs:string"/>
              </xs:choice>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    const xml = `
      <ContactInfo>
        <Email>user@example.com</Email>
        <Phone>123-456-7890</Phone>
      </ContactInfo>
    `;
    const result = validator.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/Choice error:/);
  });

  it("should fail when no choices are present", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="ContactInfo">
          <xs:complexType>
            <xs:sequence>
              <xs:choice>
                <xs:element name="Email" type="xs:string"/>
                <xs:element name="Phone" type="xs:string"/>
              </xs:choice>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    const xml = `
      <ContactInfo></ContactInfo>
    `;
    const result = validator.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/Choice error:/);
  });

  it("validateAsync returns a Promise resolving to the same result as validate", async () => {
    const xsd = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="Person" type="xs:string" minOccurs="1" maxOccurs="1"/></xs:schema>`;
    const xml = `<Person>John Doe</Person>`;
    const syncResult = validator.validate(xml, xsd);
    const asyncResult = await validator.validateAsync(xml, xsd);
    expect(asyncResult).toEqual(syncResult);
  });

  it("should validate string pattern/length constraints successfully", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Username">
          <xs:simpleType>
            <xs:restriction base="xs:string">
              <xs:pattern value="^[A-Za-z0-9_]+$"/>
              <xs:minLength value="3"/>
              <xs:maxLength value="8"/>
            </xs:restriction>
          </xs:simpleType>
        </xs:element>
      </xs:schema>
    `;
    // This meets pattern /^[A-Za-z0-9_]+$/ and length is 7
    const xmlValid = `<Username>abc_123</Username>`;
    const resultValid = validator.validate(xmlValid, xsd);
    expect(resultValid.valid).toBe(true);

    // Pattern fail: has a dash
    const xmlPatternFail = `<Username>abc-123</Username>`;
    const resultPatternFail = validator.validate(xmlPatternFail, xsd);
    expect(resultPatternFail.valid).toBe(false);
    expect(resultPatternFail.errors[0].message).toMatch(
      'Element <Username> must match pattern "^[A-Za-z0-9_]+$", but found "abc-123".',
    );

    // minLength fail: only 2
    const xmlMinFail = `<Username>ab</Username>`;
    const resultMinFail = validator.validate(xmlMinFail, xsd);
    expect(resultMinFail.valid).toBe(false);
    expect(resultMinFail.errors[0].message).toMatch(
      /Element <Username> must have a minimum length of 3, but found length 2./,
    );

    // maxLength fail: length 9
    const xmlMaxFail = `<Username>abc_12345</Username>`;
    const resultMaxFail = validator.validate(xmlMaxFail, xsd);
    expect(resultMaxFail.valid).toBe(false);
    expect(resultMaxFail.errors[0].message).toMatch(
      /Element <Username> must have a maximum length of 8, but found length 9./,
    );
  });

  it("should count child occurrences per parent, not globally (fix-occurrence-per-parent)", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="root">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="a">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="item" type="xs:string" minOccurs="1" maxOccurs="1"/>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
              <xs:element name="b">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="item" type="xs:string" minOccurs="1" maxOccurs="1"/>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    // Each parent has exactly 1 <item> — should pass even though there are 2 total
    const xmlPass = `<root><a><item>1</item></a><b><item>2</item></b></root>`;
    const resultPass = validator.validate(xmlPass, xsd);
    expect(resultPass.valid).toBe(true);
    expect(resultPass.errors).toHaveLength(0);

    // One parent has 2 <item> children — exceeds maxOccurs=1, should fail
    const xmlFail = `<root><a><item>1</item><item>2</item></a><b><item>3</item></b></root>`;
    const resultFail = validator.validate(xmlFail, xsd);
    expect(resultFail.valid).toBe(false);
    expect(resultFail.errors.some((e) => e.code === "OCCURRENCE_VIOLATION")).toBe(true);
  });

  it("should not over-count nested elements with same name as root (fix-occurrence-per-parent)", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="person" minOccurs="1" maxOccurs="1">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="name" type="xs:string" minOccurs="1" maxOccurs="1"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:schema>
    `;
    // The <name> element appears once inside <person>; root occurrence should be 1
    const xml = `<person><name>Alice</name></person>`;
    const result = validator.validate(xml, xsd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
