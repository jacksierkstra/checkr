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
