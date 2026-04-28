import { ParseListStep } from "./list";

describe("ParseListStep", () => {
  let step: ParseListStep;

  beforeEach(() => {
    step = new ParseListStep();
  });

  function parseElement(xsd: string): Element {
    return new DOMParser()
      .parseFromString(xsd, "text/xml")
      .documentElement!.getElementsByTagName("xs:element")[0]!;
  }

  it("should parse xs:list itemType", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="scores">
          <xs:simpleType>
            <xs:list itemType="xs:integer"/>
          </xs:simpleType>
        </xs:element>
      </xs:schema>
    `;
    const result = step.execute(parseElement(xsd));
    expect(result.listItemType).toBe("xs:integer");
  });

  it("should return empty when no xs:list is present", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="scores" type="xs:string"/>
      </xs:schema>
    `;
    const result = step.execute(parseElement(xsd));
    expect(result).toEqual({});
  });

  it("should return empty when xs:list has no itemType", () => {
    const xsd = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="scores">
          <xs:simpleType>
            <xs:list/>
          </xs:simpleType>
        </xs:element>
      </xs:schema>
    `;
    const result = step.execute(parseElement(xsd));
    expect(result).toEqual({});
  });
});
