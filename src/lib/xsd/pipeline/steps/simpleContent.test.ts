import { ParseSimpleContentStep } from "./simpleContent";

describe("ParseSimpleContentStep", () => {
  let step: ParseSimpleContentStep;
  let domParser: DOMParser;

  beforeEach(() => {
    step = new ParseSimpleContentStep();
    domParser = new DOMParser();
  });

  function parse(xml: string): Element {
    return domParser.parseFromString(xml, "text/xml").documentElement!;
  }

  it("returns empty for elements without simpleContent", () => {
    const el = parse(
      `<xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="plain" type="xs:string"/>`,
    );
    expect(step.execute(el)).toEqual({});
  });

  it("parses simpleContent extension with xs: base type", () => {
    const el = parse(`
      <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="price">
        <xs:complexType>
          <xs:simpleContent>
            <xs:extension base="xs:decimal">
              <xs:attribute name="currency" type="xs:string" use="required"/>
            </xs:extension>
          </xs:simpleContent>
        </xs:complexType>
      </xs:element>
    `);
    const result = step.execute(el);
    expect(result.type).toBe("xs:decimal");
    expect(result.attributes).toHaveLength(1);
    expect(result.attributes![0].name).toBe("currency");
    expect(result.attributes![0].use).toBe("required");
  });

  it("parses simpleContent extension with multiple attributes", () => {
    const el = parse(`
      <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="quantity">
        <xs:complexType>
          <xs:simpleContent>
            <xs:extension base="xs:integer">
              <xs:attribute name="unit" type="xs:string"/>
              <xs:attribute name="version" type="xs:string" fixed="1.0"/>
            </xs:extension>
          </xs:simpleContent>
        </xs:complexType>
      </xs:element>
    `);
    const result = step.execute(el);
    expect(result.type).toBe("xs:integer");
    expect(result.attributes).toHaveLength(2);
    expect(result.attributes![1].fixed).toBe("1.0");
  });

  it("parses simpleContent restriction with xs: base type", () => {
    const el = parse(`
      <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="code">
        <xs:complexType>
          <xs:simpleContent>
            <xs:restriction base="xs:string">
              <xs:attribute name="lang" type="xs:string" use="required"/>
            </xs:restriction>
          </xs:simpleContent>
        </xs:complexType>
      </xs:element>
    `);
    const result = step.execute(el);
    expect(result.type).toBe("xs:string");
    expect(result.attributes).toHaveLength(1);
    expect(result.attributes![0].name).toBe("lang");
  });

  it("does not set type for non-xs: base in extension", () => {
    const el = parse(`
      <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="item">
        <xs:complexType>
          <xs:simpleContent>
            <xs:extension base="CustomType">
              <xs:attribute name="id" type="xs:string"/>
            </xs:extension>
          </xs:simpleContent>
        </xs:complexType>
      </xs:element>
    `);
    const result = step.execute(el);
    expect(result.type).toBeUndefined();
    expect(result.attributes).toHaveLength(1);
  });
});
