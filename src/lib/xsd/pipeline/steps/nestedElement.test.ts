import { ParseNestedElementsStep } from "./nestedElement";

describe("ParseNestedElementsStep", () => {
  let step: ParseNestedElementsStep;

  beforeEach(() => {
    step = new ParseNestedElementsStep();
  });

  it("should parse nested elements within complexType and sequence", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:sequence>
                        <xs:element name="child1" minOccurs="0" maxOccurs="1" />
                        <xs:element name="child2" minOccurs="1" maxOccurs="unbounded" />
                    </xs:sequence>
                </xs:complexType>
            </xs:schema>
        `;

    const parser = new DOMParser();
    const element = parser.parseFromString(xsdElement, "text/xml");
    const result = step.execute(element.documentElement!);

    expect(result.children).toEqual([
      { name: "child1", minOccurs: 0, maxOccurs: 1 },
      { name: "child2", minOccurs: 1, maxOccurs: "unbounded" },
    ]);

    expect(result.choices).toEqual([]);
  });

  it("should parse nested elements within complexType and choice", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:choice>
                        <xs:element name="choice1" />
                        <xs:element name="choice2" />
                    </xs:choice>
                </xs:complexType>
            </xs:schema>
        `;

    const parser = new DOMParser();
    const element = parser.parseFromString(xsdElement, "text/xml");

    const result = step.execute(element.documentElement!);

    expect(result.choices).toEqual([
      {
        elements: [
          { name: "choice1", minOccurs: 0, maxOccurs: 1 },
          { name: "choice2", minOccurs: 0, maxOccurs: 1 },
        ],
      },
    ]);
    expect(result.children).toEqual([]);
  });

  it("should parse nested sequences", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:sequence>
                        <xs:sequence>
                            <xs:element name="nestedChild" />
                        </xs:sequence>
                    </xs:sequence>
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.children).toEqual([{ name: "nestedChild", minOccurs: 1, maxOccurs: 1 }]);
  });

  it("should parse nested choices", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:choice>
                        <xs:choice>
                            <xs:element name="nestedChoice" />
                        </xs:choice>
                    </xs:choice>
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.choices).toEqual([
      { elements: [{ name: "nestedChoice", minOccurs: 0, maxOccurs: 1 }] },
    ]);
  });

  it("should parse mixed sequence and choice", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:sequence>
                        <xs:element name="seqChild" />
                    </xs:sequence>
                    <xs:choice>
                        <xs:element name="choiceChild" />
                    </xs:choice>
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.children).toEqual([{ name: "seqChild", minOccurs: 1, maxOccurs: 1 }]);
    expect(result.choices).toEqual([
      { elements: [{ name: "choiceChild", minOccurs: 0, maxOccurs: 1 }] },
    ]);
  });

  it("should handle empty complexType", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType></xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.children).toEqual([]);
    expect(result.choices).toEqual([]);
  });

  it("should handle complexType with attributes", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType attr="value">
                    <xs:element name="child" />
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.children).toEqual([{ name: "child", minOccurs: 1, maxOccurs: 1 }]);
  });

  it("should ignore text nodes other than whitespace", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    Some text
                    <xs:element name="child" />
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.children).toEqual([{ name: "child", minOccurs: 1, maxOccurs: 1 }]);
  });

  it("should handle minOccurs and maxOccurs variations", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:complexType>
                    <xs:element name="child1" minOccurs="1" maxOccurs="5" />
                    <xs:element name="child2" minOccurs="0" maxOccurs="unbounded" />
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.children).toEqual([
      { name: "child1", minOccurs: 1, maxOccurs: 5 },
      { name: "child2", minOccurs: 0, maxOccurs: "unbounded" },
    ]);
  });

  it("should clamp xs:all child maxOccurs and preserve group refs", () => {
    const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:group name="addressGroup">
                    <xs:sequence>
                        <xs:element name="street" />
                    </xs:sequence>
                </xs:group>
                <xs:complexType>
                    <xs:all>
                        <xs:element name="name" maxOccurs="5" />
                        <xs:group ref="addressGroup" maxOccurs="2" />
                    </xs:all>
                </xs:complexType>
            </xs:schema>
        `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.children).toEqual([
      { name: "name", minOccurs: 1, maxOccurs: 1, inAll: true },
      { name: "addressGroup", groupRef: "addressGroup", minOccurs: 1, maxOccurs: 1, inAll: true },
    ]);
  });

  it("should capture group-level minOccurs/maxOccurs on xs:sequence as isSequence choice", () => {
    const xsdElement = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:complexType>
                <xs:sequence minOccurs="0" maxOccurs="3">
                    <xs:element name="a" />
                    <xs:element name="b" />
                </xs:sequence>
            </xs:complexType>
        </xs:schema>
    `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.children).toEqual([]);
    expect(result.choices).toEqual([
      {
        elements: [
          { name: "a", minOccurs: 1, maxOccurs: 1 },
          { name: "b", minOccurs: 1, maxOccurs: 1 },
        ],
        minOccurs: 0,
        maxOccurs: 3,
        isSequence: true,
      },
    ]);
  });

  it("should capture group-level minOccurs/maxOccurs on xs:choice", () => {
    const xsdElement = `
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <xs:complexType>
                <xs:choice minOccurs="2" maxOccurs="unbounded">
                    <xs:element name="a" />
                    <xs:element name="b" />
                </xs:choice>
            </xs:complexType>
        </xs:schema>
    `;
    const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement;
    const result = step.execute(element!);
    expect(result.choices).toEqual([
      {
        elements: [
          { name: "a", minOccurs: 0, maxOccurs: 1 },
          { name: "b", minOccurs: 0, maxOccurs: 1 },
        ],
        minOccurs: 2,
        maxOccurs: "unbounded",
      },
    ]);
  });
});
