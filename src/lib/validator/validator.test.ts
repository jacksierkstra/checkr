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

  it("should validate XML according to XSD schema - success case", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Person" type="xs:string" minOccurs="1" maxOccurs="1"/>
      </xs:schema>
    `;
    const xml = `<Person>John Doe</Person>`;
    const result = await validator.validate(xml, xsd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail validation when required element is missing", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Person" type="xs:string" minOccurs="1" maxOccurs="1"/>
      </xs:schema>
    `;
    const xml = `<NotPerson>Jane Doe</NotPerson>`;
    const result = await validator.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Person/);
  });

  it("should validate xs:integer type correctly", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Age" type="xs:integer" minOccurs="1" maxOccurs="1"/>
      </xs:schema>
    `;
    const xmlValid = `<Age>30</Age>`;
    const resultValid = await validator.validate(xmlValid, xsd);
    expect(resultValid.valid).toBe(true);

    const xmlInvalid = `<Age>thirty</Age>`;
    const resultInvalid = await validator.validate(xmlInvalid, xsd);
    expect(resultInvalid.valid).toBe(false);
    expect(resultInvalid.errors[0]).toMatch(/must be an integer|not a valid integer/);
  });

  it("should validate xs:date type correctly", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="BirthDate" type="xs:date" minOccurs="1" maxOccurs="1"/>
      </xs:schema>
    `;
    const xmlValid = `<BirthDate>1990-05-20</BirthDate>`;
    const resultValid = await validator.validate(xmlValid, xsd);
    expect(resultValid.valid).toBe(true);

    const xmlInvalid = `<BirthDate>May 20, 1990</BirthDate>`;
    const resultInvalid = await validator.validate(xmlInvalid, xsd);
    expect(resultInvalid.valid).toBe(false);
    expect(resultInvalid.errors[0]).toMatch(/must be a valid date/);
  });

  it("should validate enumerated values correctly", async () => {
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
    const resultValid = await validator.validate(xmlValid, xsd);
    expect(resultValid.valid).toBe(true);

    const xmlInvalid = `<Status>InvalidValue</Status>`;
    const resultInvalid = await validator.validate(xmlInvalid, xsd);
    expect(resultInvalid.valid).toBe(false);
    expect(resultInvalid.errors[0]).toMatch(/must be one of/);
  });

  it("should validate fixed attribute values", async () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="Item">
          <xs:attribute name="category" type="xs:string" fixed="electronics"/>
        </xs:element>
      </xs:schema>
    `;
    const xmlInvalid = `<Item category="books"/>`;
    const resultInvalid = await validator.validate(xmlInvalid, xsd);
    expect(resultInvalid.valid).toBe(false);
    expect(resultInvalid.errors[0]).toMatch(/must be fixed to 'electronics'/);
  });

  it("should validate choice elements (Email only)", async () => {
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
    const result = await validator.validate(xml, xsd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should validate choice elements (Phone only)", async () => {
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
    const result = await validator.validate(xml, xsd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail when both choices are present", async () => {
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
    const result = await validator.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Choice error:/);
  });

  it("should fail when no choices are present", async () => {
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
    const result = await validator.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Choice error:/);
  });

  it("should validate string pattern/length constraints successfully", async () => {
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
    const resultValid = await validator.validate(xmlValid, xsd);
    expect(resultValid.valid).toBe(true);

    // Pattern fail: has a dash
    const xmlPatternFail = `<Username>abc-123</Username>`;
    const resultPatternFail = await validator.validate(xmlPatternFail, xsd);
    expect(resultPatternFail.valid).toBe(false);
    expect(resultPatternFail.errors[0]).toMatch(/does not match the pattern/);

    // minLength fail: only 2
    const xmlMinFail = `<Username>ab</Username>`;
    const resultMinFail = await validator.validate(xmlMinFail, xsd);
    expect(resultMinFail.valid).toBe(false);
    expect(resultMinFail.errors[0]).toMatch(/must be at least length 3/);

    // maxLength fail: length 9
    const xmlMaxFail = `<Username>abc_12345</Username>`;
    const resultMaxFail = await validator.validate(xmlMaxFail, xsd);
    expect(resultMaxFail.valid).toBe(false);
    expect(resultMaxFail.errors[0]).toMatch(/must be at most length 8/);
  });
});
