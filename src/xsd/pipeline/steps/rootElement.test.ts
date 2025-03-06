import { ParseRootElementStep } from "./rootElement";

describe("ParseRootElementStep", () => {
    let step: ParseRootElementStep;

    beforeEach(() => {
        step = new ParseRootElementStep();
    });

    it("should parse basic element with name and type", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="testElement" type="xs:string" /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: "testElement", type: "xs:string", minOccurs: 0, maxOccurs: 1 });
    });

    it("should parse element with name only", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="testElement" /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: "testElement", type: undefined, minOccurs: 0, maxOccurs: 1 });
    });

    it("should parse element with name and minOccurs", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="testElement" minOccurs="5" /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: "testElement", type: undefined, minOccurs: 5, maxOccurs: 1 });
    });

    it("should parse element with name and maxOccurs", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="testElement" maxOccurs="10" /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: "testElement", type: undefined, minOccurs: 0, maxOccurs: 10 });
    });

    it("should parse element with name, minOccurs, and maxOccurs", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="testElement" minOccurs="2" maxOccurs="8" /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: "testElement", type: undefined, minOccurs: 2, maxOccurs: 8 });
    });

    it("should handle maxOccurs='unbounded'", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="testElement" maxOccurs="unbounded" /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: "testElement", type: undefined, minOccurs: 0, maxOccurs: 1 });
    });

    it("should handle element with no attributes", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({});
    });

    it("should handle element with empty name attribute", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="" /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: "", type: undefined, minOccurs: 0, maxOccurs: 1 });
    });

    it("should handle element with non-integer minOccurs", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="testElement" minOccurs="invalid" /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: "testElement", type: undefined, minOccurs: 0, maxOccurs: 1 });
    });

    it("should handle element with non-integer maxOccurs", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="testElement" maxOccurs="invalid" /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: "testElement", type: undefined, minOccurs: 0, maxOccurs: NaN });
    });

    it("should handle leading and trailing whitespace in name and type attributes", () => {
        const xsdElement = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name=" testElement " type=" xs:string " /></xs:schema>`;
        const element = new DOMParser().parseFromString(xsdElement, "text/xml").documentElement.firstChild as Element;
        const result = step.execute(element);
        expect(result).toEqual({ name: " testElement ", type: " xs:string ", minOccurs: 0, maxOccurs: 1 });
    });
});