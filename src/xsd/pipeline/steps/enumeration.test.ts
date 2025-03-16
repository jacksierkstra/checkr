import { ParseEnumerationStep } from "./enumeration";
import { DOMParser, Element } from "@xmldom/xmldom";

describe("ParseEnumerationStep", () => {
    let step: ParseEnumerationStep;

    beforeEach(() => {
        step = new ParseEnumerationStep();
    });

    it("should parse basic enumeration", () => {
        const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:enumeration value="value1" />
                            <xs:enumeration value="value2" />
                            <xs:enumeration value="value3" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
        const result = step.execute(element!);
        expect(result).toEqual({ enumeration: ["value1", "value2", "value3"] });
    });

    it("should parse enumeration with whitespace", () => {
        const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:enumeration value=" value1 " />
                            <xs:enumeration value="value 2" />
                            <xs:enumeration value="value3  " />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
        const result = step.execute(element!);
        expect(result).toEqual({ enumeration: [" value1 ", "value 2", "value3  "] });
    });

    it("should parse enumeration with empty values", () => {
        const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:enumeration value="value1" />
                            <xs:enumeration value="" />
                            <xs:enumeration value="value3" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
        const result = step.execute(element!);
        expect(result).toEqual({ enumeration: ["value1", "", "value3"] });
    });

    it("should handle no simpleType", () => {
        const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test" />
            </xs:schema>
        `;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
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
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
        const result = step.execute(element!);
        expect(result).toEqual({});
    });

    it("should handle restriction with no enumerations", () => {
        const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string" />
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
        const result = step.execute(element!);
        expect(result).toEqual({});
    });

    it("should handle single enumeration value", () => {
        const xsdElement = `
            <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
                <xs:element name="test">
                    <xs:simpleType>
                        <xs:restriction base="xs:string">
                            <xs:enumeration value="value1" />
                        </xs:restriction>
                    </xs:simpleType>
                </xs:element>
            </xs:schema>
        `;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
        const result = step.execute(element!);
        expect(result).toEqual({ enumeration: ["value1"] });
    });
});