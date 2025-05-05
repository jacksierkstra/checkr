import { XMLParserImpl } from "@lib/xml/parser";

describe('XML parsing', () => {
    it('should parse a valid XML string.', async () => {
        const xml = `<root><child>value</child></root>`;
        const parser = new XMLParserImpl();
        const result = parser['parse'](xml);
        expect(result).toBeDefined();
        expect(result.documentElement?.localName).toBe('root');
    });

    it('should throw an error for an invalid XML string.', async () => {
        const xml = `<root`;
        const parser = new XMLParserImpl();
        expect(() => parser['parse'](xml)).toThrow();
    });
});