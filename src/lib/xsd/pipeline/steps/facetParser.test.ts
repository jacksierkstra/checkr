import { parseRestrictionFacets } from "@lib/xsd/pipeline/steps/facetParser";

const XSD_NS = "http://www.w3.org/2001/XMLSchema";

function makeRestriction(inner: string): Element {
  const xml = `<xs:restriction xmlns:xs="${XSD_NS}" base="xs:string">${inner}</xs:restriction>`;
  return new DOMParser().parseFromString(xml, "application/xml").documentElement;
}

describe("parseRestrictionFacets", () => {
  it("parses a single xs:pattern", () => {
    const el = makeRestriction(`<xs:pattern value="[A-Z]+" />`);
    const facets = parseRestrictionFacets(el);
    expect(facets.pattern).toBe("[A-Z]+");
  });

  it("combines multiple xs:pattern facets as OR union", () => {
    const el = makeRestriction(`
      <xs:pattern value="[A-Z]+" />
      <xs:pattern value="[0-9]+" />
    `);
    const facets = parseRestrictionFacets(el);
    // Two patterns joined as alternation
    expect(facets.pattern).toBe("(?:[A-Z]+)|(?:[0-9]+)");
    // Combined pattern should match either alternative
    const regex = new RegExp(`^(?:${facets.pattern})$`);
    expect(regex.test("ABC")).toBe(true);
    expect(regex.test("123")).toBe(true);
    expect(regex.test("abc")).toBe(false);
  });

  it("parses enumeration values", () => {
    const el = makeRestriction(`
      <xs:enumeration value="red" />
      <xs:enumeration value="green" />
      <xs:enumeration value="blue" />
    `);
    const facets = parseRestrictionFacets(el);
    expect(facets.enumeration).toEqual(["red", "green", "blue"]);
  });

  it("parses numeric facets", () => {
    const el = makeRestriction(`
      <xs:minInclusive value="0" />
      <xs:maxInclusive value="100" />
      <xs:minExclusive value="-1" />
      <xs:maxExclusive value="101" />
      <xs:totalDigits value="5" />
      <xs:fractionDigits value="2" />
    `);
    const facets = parseRestrictionFacets(el);
    expect(facets.minInclusive).toBe(0);
    expect(facets.maxInclusive).toBe(100);
    expect(facets.minExclusive).toBe(-1);
    expect(facets.maxExclusive).toBe(101);
    expect(facets.totalDigits).toBe(5);
    expect(facets.fractionDigits).toBe(2);
  });

  it("parses length facets", () => {
    const el = makeRestriction(`
      <xs:length value="5" />
      <xs:minLength value="2" />
      <xs:maxLength value="10" />
    `);
    const facets = parseRestrictionFacets(el);
    expect(facets.length).toBe(5);
    expect(facets.minLength).toBe(2);
    expect(facets.maxLength).toBe(10);
  });

  it("parses whiteSpace facet", () => {
    const el = makeRestriction(`<xs:whiteSpace value="collapse" />`);
    const facets = parseRestrictionFacets(el);
    expect(facets.whiteSpace).toBe("collapse");
  });

  it("returns empty object when restriction has no facets", () => {
    const el = makeRestriction("");
    const facets = parseRestrictionFacets(el);
    expect(Object.keys(facets)).toHaveLength(0);
  });
});
