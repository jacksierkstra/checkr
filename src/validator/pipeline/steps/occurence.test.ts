import { XSDElement } from '@lib/types/xsd';
import { validateOccurrence } from '@lib/validator/pipeline/steps/occurence';
import { DOMParser } from '@xmldom/xmldom';
import { Element } from "@xmldom/xmldom";

describe('validateOccurrence', () => {
    let parser: DOMParser;

    beforeEach(() => {
        parser = new DOMParser();
    });

    // Helper to create a dummy XML element.
    function createDummyElement(tagName: string, text: string): Element | null {
        const xml = `<${tagName}>${text}</${tagName}>`;
        return parser.parseFromString(xml, 'application/xml').documentElement;
    }

    it('should return no errors when occurrence constraints are met', () => {
        const schema: XSDElement = { name: 'Test', type: 'xs:string', minOccurs: 1, maxOccurs: 3 };
        const elements: Element[] = [createDummyElement('Test', 'a')!];
        const errors = validateOccurrence(elements, schema);
        expect(errors).toEqual([]);
    });

    it('should return an error when count is below minOccurs', () => {
        const schema: XSDElement = { name: 'Test', type: 'xs:string', minOccurs: 2, maxOccurs: 3 };
        const elements: Element[] = [createDummyElement('Test', 'a')!];
        const errors = validateOccurrence(elements, schema);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toMatch(/at least 2 times/);
    });

    it('should return an error when count is above maxOccurs', () => {
        const schema: XSDElement = { name: 'Test', type: 'xs:string', minOccurs: 1, maxOccurs: 2 };
        const elements: Element[] = [
            createDummyElement('Test', 'a')!,
            createDummyElement('Test', 'b')!,
            createDummyElement('Test', 'c')!,
        ];
        const errors = validateOccurrence(elements, schema);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toMatch(/at most 2 times/);
    });

    it('should not validate maxOccurs when set to unbounded', () => {
        const schema: XSDElement = { name: 'Test', type: 'xs:string', minOccurs: 1, maxOccurs: 'unbounded' };
        const elements: Element[] = [
            createDummyElement('Test', 'a')!,
            createDummyElement('Test', 'b')!,
            createDummyElement('Test', 'c')!,
        ];
        const errors = validateOccurrence(elements, schema);
        expect(errors).toEqual([]);
    });
});