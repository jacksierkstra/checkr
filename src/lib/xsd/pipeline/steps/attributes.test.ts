import { ParseAttributesStep } from "./attributes";

describe("ParseAttributesStep", () => {
  let step: ParseAttributesStep;

  beforeEach(() => {
    step = new ParseAttributesStep();
  });

  it("should parse basic attributes", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:attribute name="attr1" type="xs:integer" use="required" />
                    <xs:attribute name="attr2" type="xs:date" use="optional" />
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result).toEqual({
      attributes: [
        { name: "attr1", type: "xs:integer", use: "required", fixed: undefined },
        { name: "attr2", type: "xs:date", use: "optional", fixed: undefined },
      ],
    });
  });

  it("should parse attribute with fixed value", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:attribute name="attr1" type="xs:string" fixed="fixedValue" />
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result).toEqual({
      attributes: [{ name: "attr1", type: "xs:string", use: "optional", fixed: "fixedValue" }],
    });
  });

  it("should parse attribute with default values", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:attribute name="attr1" />
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result).toEqual({
      attributes: [{ name: "attr1", type: "xs:string", use: "optional", fixed: undefined }],
    });
  });

  it("should handle no attributes", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType />
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result).toEqual({ attributes: [] });
  });

  it("should handle attributes with whitespace", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:attribute name=" attr1 " type=" xs:integer " use=" required " fixed=" fixed value " />
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result).toEqual({
      attributes: [
        { name: " attr1 ", type: " xs:integer ", use: " required ", fixed: " fixed value " },
      ],
    });
  });

  it("should handle attributes with different use cases", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:attribute name="attr1" use="required" />
                    <xs:attribute name="attr2" use="optional" />
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result).toEqual({
      attributes: [
        { name: "attr1", type: "xs:string", use: "required", fixed: undefined },
        { name: "attr2", type: "xs:string", use: "optional", fixed: undefined },
      ],
    });
  });

  it("should handle attributes with empty name attributes", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:attribute name="" use="required" />
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result).toEqual({
      attributes: [{ name: "", type: "xs:string", use: "required", fixed: undefined }],
    });
  });

  it("should set allowAnyAttribute when xs:anyAttribute is present", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType>
          <xs:attribute name="id" type="xs:string" use="required"/>
          <xs:anyAttribute/>
        </xs:complexType>
      </xs:schema>
    `;
    const element = new DOMParser()
      .parseFromString(xsd, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result.allowAnyAttribute).toBe(true);
    expect(result.attributes).toHaveLength(1);
  });

  it("should not set allowAnyAttribute when xs:anyAttribute is absent", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType>
          <xs:attribute name="id" type="xs:string"/>
        </xs:complexType>
      </xs:schema>
    `;
    const element = new DOMParser()
      .parseFromString(xsd, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result.allowAnyAttribute).toBeUndefined();
  });

  it("should parse prohibited attributes and inline simpleType facets", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType>
          <xs:attribute name="status" use="prohibited"/>
          <xs:attribute name="code" type="xs:string">
            <xs:simpleType>
              <xs:restriction base="xs:string">
                <xs:enumeration value="A"/>
                <xs:enumeration value="B"/>
              </xs:restriction>
            </xs:simpleType>
          </xs:attribute>
        </xs:complexType>
      </xs:schema>
    `;
    const element = new DOMParser()
      .parseFromString(xsd, "text/xml")
      ?.documentElement?.getElementsByTagName("xs:complexType")[0];
    const result = step.execute(element!);
    expect(result.attributes).toEqual([
      { name: "status", type: "xs:string", use: "prohibited", fixed: undefined, form: undefined },
      {
        name: "code",
        type: "xs:string",
        use: "optional",
        fixed: undefined,
        form: undefined,
        enumeration: ["A", "B"],
      },
    ]);
  });
});
