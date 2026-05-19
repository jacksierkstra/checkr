import { XMLParserImpl } from "@lib/xml/parser";

describe("XML parsing", () => {
  it("should parse a valid XML string.", async () => {
    const xml = `<root><child>value</child></root>`;
    const parser = new XMLParserImpl();
    const result = parser["parse"](xml);
    expect(result).toBeDefined();
    expect(result.documentElement?.localName).toBe("root");
  });

  it("should throw an error for an invalid XML string.", async () => {
    const xml = `<root`;
    const parser = new XMLParserImpl();
    expect(() => parser["parse"](xml)).toThrow();
  });

  it("should fall back to xmldom when DOMParser is not available.", () => {
    const originalDomParser = globalThis.DOMParser;
    // Simulate a Node.js runtime without a native DOMParser global.
    Object.defineProperty(globalThis, "DOMParser", {
      configurable: true,
      value: undefined,
    });

    try {
      const parser = new XMLParserImpl();
      const result = parser["parse"](`<root><child>value</child></root>`);

      expect(result.documentElement?.localName).toBe("root");
      expect(result.getElementsByTagName("child")[0]?.textContent).toBe("value");
    } finally {
      Object.defineProperty(globalThis, "DOMParser", {
        configurable: true,
        value: originalDomParser,
      });
    }
  });
});
