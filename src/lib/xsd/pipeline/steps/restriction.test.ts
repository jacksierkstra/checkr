import { ParseRestrictionsStep } from "./restriction";

describe("ParseRestrictionsStep", () => {
  let step: ParseRestrictionsStep;

  beforeEach(() => {
    step = new ParseRestrictionsStep();
  });

  it("should parse basic restriction with base attribute", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string" />
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({ type: "xs:string" });
  });

  it("should parse restriction with enumeration", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:enumeration value="value1" />
                            <xs:enumeration value="value2" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({ type: "xs:string", enumeration: ["value1", "value2"] });
  });

  it("should parse restriction with pattern", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:pattern value="[a-zA-Z]+" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({ type: "xs:string", pattern: "[a-zA-Z]+" });
  });

  it("should parse restriction with minLength and maxLength", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:minLength value="5" />
                            <xs:maxLength value="10" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({ type: "xs:string", minLength: 5, maxLength: 10 });
  });

  it("should parse restriction with all features combined", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:enumeration value="value1" />
                            <xs:enumeration value="value2" />
                            <xs:pattern value="[a-zA-Z]+" />
                            <xs:minLength value="5" />
                            <xs:maxLength value="10" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({
      type: "xs:string",
      enumeration: ["value1", "value2"],
      pattern: "[a-zA-Z]+",
      minLength: 5,
      maxLength: 10,
    });
  });

  it("should handle restriction with no features", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string" />
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({ type: "xs:string" });
  });

  it("should handle no simpleType", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test" />
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({});
  });

  it("should handle no restriction", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType />
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({});
  });

  it("should handle invalid minLength and maxLength values", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:minLength value="invalid" />
                            <xs:maxLength value="invalid" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({ type: "xs:string" });
  });

  it("should handle whitespace in enumeration values", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:enumeration value="value 1" />
                            <xs:enumeration value=" value2 " />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result).toEqual({ type: "xs:string", enumeration: ["value 1", " value2 "] });
  });

  it("should parse restriction with custom (non-xs:) base type and include facets in restriction object", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="MyBaseType">
                            <xs:enumeration value="A" />
                            <xs:enumeration value="B" />
                            <xs:pattern value="[AB]" />
                            <xs:minLength value="1" />
                            <xs:maxLength value="1" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result.restriction).toBeDefined();
    expect(result.restriction!.base).toBe("MyBaseType");
    expect(result.restriction!.enumeration).toEqual(["A", "B"]);
    expect(result.restriction!.pattern).toBe("[AB]");
    expect(result.restriction!.minLength).toBe(1);
    expect(result.restriction!.maxLength).toBe(1);
  });

  it("should parse restriction with custom base type and numeric constraints", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="score">
                    <xs:simpleType>
                        <xs:restriction base="MyIntType">
                            <xs:minInclusive value="0" />
                            <xs:maxInclusive value="100" />
                            <xs:minExclusive value="-1" />
                            <xs:maxExclusive value="101" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result.restriction).toBeDefined();
    expect(result.restriction!.minInclusive).toBe(0);
    expect(result.restriction!.maxInclusive).toBe(100);
    expect(result.restriction!.minExclusive).toBe(-1);
    expect(result.restriction!.maxExclusive).toBe(101);
  });

  it("should parse xs:integer restriction with minInclusive/maxInclusive onto element (bug fix)", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="age">
                    <xs:simpleType>
                        <xs:restriction base="xs:integer">
                            <xs:minInclusive value="0" />
                            <xs:maxInclusive value="120" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result.type).toBe("xs:integer");
    expect(result.minInclusive).toBe(0);
    expect(result.maxInclusive).toBe(120);
    expect(result.restriction).toBeUndefined();
  });

  it("should parse xs:decimal restriction with all numeric facets onto element", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="price">
                    <xs:simpleType>
                        <xs:restriction base="xs:decimal">
                            <xs:minExclusive value="0" />
                            <xs:maxExclusive value="1000" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result.type).toBe("xs:decimal");
    expect(result.minExclusive).toBe(0);
    expect(result.maxExclusive).toBe(1000);
  });

  it("should parse xs:length facet onto element", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="code">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:length value="5" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result.type).toBe("xs:string");
    expect(result.length).toBe(5);
  });

  it("should parse xs:totalDigits and xs:fractionDigits facets onto element", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="price">
                    <xs:simpleType>
                        <xs:restriction base="xs:decimal">
                            <xs:totalDigits value="6" />
                            <xs:fractionDigits value="2" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
    const element = new DOMParser()
      .parseFromString(xsdElement, "text/xml")
      .documentElement?.getElementsByTagName("xs:element")[0];
    const result = step.execute(element!);
    expect(result.type).toBe("xs:decimal");
    expect(result.totalDigits).toBe(6);
    expect(result.fractionDigits).toBe(2);
  });
});
