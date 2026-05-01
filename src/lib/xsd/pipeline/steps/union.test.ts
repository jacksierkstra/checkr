import { ParseUnionStep } from "./union";

describe("ParseUnionStep", () => {
  let step: ParseUnionStep;

  beforeEach(() => {
    step = new ParseUnionStep();
  });

  function parseElement(xsd: string): Element {
    return new DOMParser()
      .parseFromString(xsd, "text/xml")
      .documentElement!.getElementsByTagName("xs:element")[0]!;
  }

  it("should parse xs:union memberTypes", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="value">
          <xs:simpleType>
            <xs:union memberTypes="xs:integer xs:string"/>
          </xs:simpleType>
        </xs:element>
      </xs:schema>
    `;
    const result = step.execute(parseElement(xsd));
    expect(result.unionMemberTypes).toEqual(["xs:integer", "xs:string"]);
  });

  it("should return empty when no xs:union is present", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="value" type="xs:string"/>
      </xs:schema>
    `;
    expect(step.execute(parseElement(xsd))).toEqual({});
  });

  it("should parse inline xs:simpleType members within xs:union", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="value">
          <xs:simpleType>
            <xs:union>
              <xs:simpleType>
                <xs:restriction base="xs:integer">
                  <xs:minInclusive value="0"/>
                  <xs:maxInclusive value="100"/>
                </xs:restriction>
              </xs:simpleType>
              <xs:simpleType>
                <xs:restriction base="xs:string">
                  <xs:enumeration value="unlimited"/>
                </xs:restriction>
              </xs:simpleType>
            </xs:union>
          </xs:simpleType>
        </xs:element>
      </xs:schema>
    `;
    const result = step.execute(parseElement(xsd));
    expect(result.unionInlineMembers).toHaveLength(2);
    expect(result.unionInlineMembers![0]).toMatchObject({ type: "xs:integer", minInclusive: 0, maxInclusive: 100 });
    expect(result.unionInlineMembers![1]).toMatchObject({ type: "xs:string", enumeration: ["unlimited"] });
    // memberTypes not present
    expect(result.unionMemberTypes).toBeUndefined();
  });

  it("should parse both memberTypes and inline members when both are present", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="value">
          <xs:simpleType>
            <xs:union memberTypes="xs:boolean">
              <xs:simpleType>
                <xs:restriction base="xs:string">
                  <xs:enumeration value="yes"/>
                  <xs:enumeration value="no"/>
                </xs:restriction>
              </xs:simpleType>
            </xs:union>
          </xs:simpleType>
        </xs:element>
      </xs:schema>
    `;
    const result = step.execute(parseElement(xsd));
    expect(result.unionMemberTypes).toEqual(["xs:boolean"]);
    expect(result.unionInlineMembers).toHaveLength(1);
    expect(result.unionInlineMembers![0]).toMatchObject({ type: "xs:string", enumeration: ["yes", "no"] });
  });

  it("should return empty when xs:union has no memberTypes", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="value">
          <xs:simpleType>
            <xs:union/>
          </xs:simpleType>
        </xs:element>
      </xs:schema>
    `;
    expect(step.execute(parseElement(xsd))).toEqual({});
  });
});
