import { ParseExtensionStep } from "./extension";
import { DOMParser } from "@xmldom/xmldom";

describe("ParseExtensionStep", () => {
    let parser: ParseExtensionStep;
    let domParser: DOMParser;

    beforeEach(() => {
        parser = new ParseExtensionStep();
        domParser = new DOMParser();
    });

    it("should parse extension with base type", () => {
        const xml = `
        <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="extended">
            <xs:complexType>
                <xs:complexContent>
                    <xs:extension base="BaseType">
                    </xs:extension>
                </xs:complexContent>
            </xs:complexType>
        </xs:element>
        `;

        const doc = domParser.parseFromString(xml, "text/xml");
        const element = doc.documentElement;
        
        // Add null check to satisfy TypeScript
        if (!element) {
            throw new Error("Failed to parse XML element");
        }
        
        const result = parser.execute(element);

        expect(result.extension).toBeDefined();
        expect(result.extension?.base).toBe("BaseType");
    });

    it("should parse extension with nested elements", () => {
        const xml = `
        <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="extended">
            <xs:complexType>
                <xs:complexContent>
                    <xs:extension base="BaseType">
                        <xs:sequence>
                            <xs:element name="child1" type="xs:string" />
                            <xs:element name="child2" type="xs:string" />
                        </xs:sequence>
                    </xs:extension>
                </xs:complexContent>
            </xs:complexType>
        </xs:element>
        `;

        const doc = domParser.parseFromString(xml, "text/xml");
        const element = doc.documentElement;
        
        // Add null check to satisfy TypeScript
        if (!element) {
            throw new Error("Failed to parse XML element");
        }
        
        const result = parser.execute(element);

        expect(result.extension).toBeDefined();
        expect(result.extension?.base).toBe("BaseType");
        expect(result.extension?.children).toBeDefined();
        expect(result.extension?.children?.length).toBe(2);
        expect(result.extension?.children?.[0].name).toBe("child1");
        expect(result.extension?.children?.[1].name).toBe("child2");
    });

    it("should parse extension with attributes", () => {
        const xml = `
        <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="extended">
            <xs:complexType>
                <xs:complexContent>
                    <xs:extension base="BaseType">
                        <xs:attribute name="attr1" type="xs:string" />
                        <xs:attribute name="attr2" type="xs:integer" use="required" />
                    </xs:extension>
                </xs:complexContent>
            </xs:complexType>
        </xs:element>
        `;

        const doc = domParser.parseFromString(xml, "text/xml");
        const element = doc.documentElement;
        
        // Add null check to satisfy TypeScript
        if (!element) {
            throw new Error("Failed to parse XML element");
        }
        
        const result = parser.execute(element);

        expect(result.extension).toBeDefined();
        expect(result.extension?.base).toBe("BaseType");
        expect(result.extension?.attributes).toBeDefined();
        expect(result.extension?.attributes?.length).toBe(2);
        expect(result.extension?.attributes?.[0].name).toBe("attr1");
        expect(result.extension?.attributes?.[1].name).toBe("attr2");
        expect(result.extension?.attributes?.[1].use).toBe("required");
    });

    it("should parse extension with choice elements", () => {
        const xml = `
        <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="extended">
            <xs:complexType>
                <xs:complexContent>
                    <xs:extension base="BaseType">
                        <xs:choice>
                            <xs:element name="option1" type="xs:string" />
                            <xs:element name="option2" type="xs:string" />
                        </xs:choice>
                    </xs:extension>
                </xs:complexContent>
            </xs:complexType>
        </xs:element>
        `;

        const doc = domParser.parseFromString(xml, "text/xml");
        const element = doc.documentElement;
        
        // Add null check to satisfy TypeScript
        if (!element) {
            throw new Error("Failed to parse XML element");
        }
        
        const result = parser.execute(element);

        expect(result.extension).toBeDefined();
        expect(result.extension?.base).toBe("BaseType");
        expect(result.extension?.choices).toBeDefined();
        expect(result.extension?.choices?.length).toBe(1);
        expect(result.extension?.choices?.[0].elements).toBeDefined();
        expect(result.extension?.choices?.[0].elements.length).toBe(2);
        expect(result.extension?.choices?.[0].elements[0].name).toBe("option1");
        expect(result.extension?.choices?.[0].elements[1].name).toBe("option2");
    });

    it("should return empty object for elements without extension", () => {
        const xml = `
        <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="simple" type="xs:string" />
        `;

        const doc = domParser.parseFromString(xml, "text/xml");
        const element = doc.documentElement;
        
        // Add null check to satisfy TypeScript
        if (!element) {
            throw new Error("Failed to parse XML element");
        }
        
        const result = parser.execute(element);

        expect(result).toEqual({});
    });

    it("should parse extension with mixed content", () => {
        const xml = `
        <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="extended">
            <xs:complexType mixed="true">
                <xs:complexContent>
                    <xs:extension base="BaseType">
                        <xs:sequence>
                            <xs:element name="child1" type="xs:string" />
                        </xs:sequence>
                    </xs:extension>
                </xs:complexContent>
            </xs:complexType>
        </xs:element>
        `;

        const doc = domParser.parseFromString(xml, "text/xml");
        const element = doc.documentElement;
        
        if (!element) {
            throw new Error("Failed to parse XML element");
        }
        
        const result = parser.execute(element);

        expect(result.extension).toBeDefined();
        expect(result.extension?.base).toBe("BaseType");
        expect(result.mixed).toBe(true);
    });

    it("should parse extension with abstract attribute", () => {
        const xml = `
        <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="extended" abstract="true">
            <xs:complexType>
                <xs:complexContent>
                    <xs:extension base="BaseType">
                        <xs:sequence>
                            <xs:element name="child1" type="xs:string" />
                        </xs:sequence>
                    </xs:extension>
                </xs:complexContent>
            </xs:complexType>
        </xs:element>
        `;

        const doc = domParser.parseFromString(xml, "text/xml");
        const element = doc.documentElement;
        
        if (!element) {
            throw new Error("Failed to parse XML element");
        }
        
        const result = parser.execute(element);

        expect(result.extension).toBeDefined();
        expect(result.extension?.base).toBe("BaseType");
        expect(result.abstract).toBe(true);
    });

    it("should parse extension with fixed and default attributes", () => {
        const xml = `
        <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="extended">
            <xs:complexType>
                <xs:complexContent>
                    <xs:extension base="BaseType">
                        <xs:attribute name="fixedAttr" type="xs:string" fixed="fixedValue" />
                        <xs:attribute name="defaultAttr" type="xs:string" default="defaultValue" />
                    </xs:extension>
                </xs:complexContent>
            </xs:complexType>
        </xs:element>
        `;

        const doc = domParser.parseFromString(xml, "text/xml");
        const element = doc.documentElement;
        
        if (!element) {
            throw new Error("Failed to parse XML element");
        }
        
        const result = parser.execute(element);

        expect(result.extension).toBeDefined();
        expect(result.extension?.base).toBe("BaseType");
        expect(result.extension?.attributes).toBeDefined();
        expect(result.extension?.attributes?.length).toBe(2);
        expect(result.extension?.attributes?.[0].name).toBe("fixedAttr");
        expect(result.extension?.attributes?.[0].fixed).toBe("fixedValue");
        expect(result.extension?.attributes?.[1].name).toBe("defaultAttr");
        expect(result.extension?.attributes?.[1].default).toBe("defaultValue");
    });

    it("should parse extension with all element", () => {
        const xml = `
        <xs:element xmlns:xs="http://www.w3.org/2001/XMLSchema" name="extended">
            <xs:complexType>
                <xs:complexContent>
                    <xs:extension base="BaseType">
                        <xs:all>
                            <xs:element name="child1" type="xs:string" />
                            <xs:element name="child2" type="xs:string" />
                        </xs:all>
                    </xs:extension>
                </xs:complexContent>
            </xs:complexType>
        </xs:element>
        `;

        const doc = domParser.parseFromString(xml, "text/xml");
        const element = doc.documentElement;
        
        if (!element) {
            throw new Error("Failed to parse XML element");
        }
        
        const result = parser.execute(element);

        expect(result.extension).toBeDefined();
        expect(result.extension?.base).toBe("BaseType");
        expect(result.extension?.children).toBeDefined();
        expect(result.extension?.children?.length).toBe(2);
        expect(result.extension?.children?.[0].name).toBe("child1");
        expect(result.extension?.children?.[1].name).toBe("child2");
    });
});