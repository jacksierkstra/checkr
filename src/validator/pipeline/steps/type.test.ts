import { XSDElement } from "@lib/types/xsd";
import { validateType } from "@lib/validator/pipeline/steps/type";
import { DOMParser } from "xmldom";

describe("validateType step", () => {
    let parser: DOMParser;

    beforeEach(() => {
        parser = new DOMParser();
    });

    function createElementWithText(tagName: string, text: string): Element {
        const xml = `<${tagName}>${text}</${tagName}>`;
        return parser.parseFromString(xml, "application/xml").documentElement;
    }

    it("should skip validation if no type is specified", () => {
        const node = createElementWithText("Test", "any content");
        const schemaElement: XSDElement = { name: "Test" }; // no type
        const errors = validateType(node, schemaElement);
        expect(errors).toEqual([]);
    });

    it("should handle enumerations correctly", () => {
        const nodeValid = createElementWithText("Status", "Approved");
        const nodeInvalid = createElementWithText("Status", "InvalidValue");

        const schemaElement: XSDElement = {
            name: "Status",
            type: "xs:string",
            enumeration: ["Pending", "Approved", "Rejected"],
        };

        // Valid enumeration
        const validErrors = validateType(nodeValid, schemaElement);
        expect(validErrors).toEqual([]);

        // Invalid enumeration
        const invalidErrors = validateType(nodeInvalid, schemaElement);
        expect(invalidErrors).toHaveLength(1);
        expect(invalidErrors[0]).toMatch(/must be one of \[Pending, Approved, Rejected\]/);
    });

    it("should validate xs:string (accept everything)", () => {
        const node = createElementWithText("Test", "hello world");
        const schemaElement: XSDElement = { name: "Test", type: "xs:string" };
        const errors = validateType(node, schemaElement);
        expect(errors).toEqual([]);
    });

    it("should validate xs:integer - success", () => {
        const node = createElementWithText("Age", "123");
        const schemaElement: XSDElement = { name: "Age", type: "xs:integer" };
        const errors = validateType(node, schemaElement);
        expect(errors).toEqual([]);
    });

    it("should validate xs:integer - fail", () => {
        const node = createElementWithText("Age", "12x3");
        const schemaElement: XSDElement = { name: "Age", type: "xs:integer" };
        const errors = validateType(node, schemaElement);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/must be an integer/);
    });

    it("should validate xs:decimal - success", () => {
        const node = createElementWithText("Price", "12.34");
        const schemaElement: XSDElement = { name: "Price", type: "xs:decimal" };
        const errors = validateType(node, schemaElement);
        expect(errors).toEqual([]);
    });

    it("should validate xs:decimal - fail", () => {
        const node = createElementWithText("Price", "abc");
        const schemaElement: XSDElement = { name: "Price", type: "xs:decimal" };
        const errors = validateType(node, schemaElement);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/must be a decimal/);
    });

    it("should validate xs:boolean - success (true)", () => {
        const node = createElementWithText("Flag", "true");
        const schemaElement: XSDElement = { name: "Flag", type: "xs:boolean" };
        const errors = validateType(node, schemaElement);
        expect(errors).toEqual([]);
    });

    it("should validate xs:boolean - fail", () => {
        const node = createElementWithText("Flag", "not_boolean");
        const schemaElement: XSDElement = { name: "Flag", type: "xs:boolean" };
        const errors = validateType(node, schemaElement);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/must be a boolean/);
    });

    it("should validate xs:date - success", () => {
        const node = createElementWithText("BirthDate", "2023-03-01");
        const schemaElement: XSDElement = { name: "BirthDate", type: "xs:date" };
        const errors = validateType(node, schemaElement);
        expect(errors).toEqual([]);
    });

    it("should validate xs:date - fail", () => {
        const node = createElementWithText("BirthDate", "March 1, 2023");
        const schemaElement: XSDElement = { name: "BirthDate", type: "xs:date" };
        const errors = validateType(node, schemaElement);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/must be a valid date/);
    });
});
