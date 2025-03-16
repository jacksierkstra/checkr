import { ParseRestrictionsStep } from "./restriction";
import { DOMParser, Element } from "@xmldom/xmldom";

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
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
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
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
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
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
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
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
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
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
        const result = step.execute(element!);
        expect(result).toEqual({ type: "xs:string", enumeration: ["value1", "value2"], pattern: "[a-zA-Z]+", minLength: 5, maxLength: 10 });
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
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
        const result = step.execute(element!);
        expect(result).toEqual({ type: "xs:string" });
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
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
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
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement?.getElementsByTagName("xs:element")[0];
        const result = step.execute(element!);
        expect(result).toEqual({ type: "xs:string", enumeration: ["value 1", " value2 "] });
    });

});