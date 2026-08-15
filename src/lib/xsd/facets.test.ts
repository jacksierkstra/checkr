import {
    SimpleTypeDefinition,
    Facet,
    WhiteSpaceValue,
} from "@lib/types/component-graph";
import {
    normalizeWhiteSpace,
    codePointLength,
    computeEffectiveFacets,
    computeWhiteSpace,
    validateFacets,
    FacetViolation,
} from "@lib/xsd/facets";

describe("facet framework (CHK-010)", () => {

    describe("whitespace normalization (§4.3.6)", () => {

        it("preserve leaves the value untouched", () => {
            expect(normalizeWhiteSpace("  a\tb\nc\r ", "preserve")).toBe("  a\tb\nc\r ");
        });

        it("replace maps #x9/#xA/#xD to #x20", () => {
            expect(normalizeWhiteSpace("a\tb\nc\rd", "replace")).toBe("a b c d");
        });

        it("collapse replaces, collapses runs, and trims", () => {
            expect(normalizeWhiteSpace("  a\t b\n\nc  d  ", "collapse")).toBe("a b c d");
            expect(normalizeWhiteSpace("", "collapse")).toBe("");
        });

    });

    describe("code-point counting (§4.3.3)", () => {

        it("counts code points, not UTF-16 code units", () => {
            // "😀" is one code point but two UTF-16 code units.
            expect("😀".length).toBe(2); // UTF-16 code units
            expect(codePointLength("😀")).toBe(1); // code points
            expect(codePointLength("a😀b")).toBe(3);
            expect(codePointLength("")).toBe(0);
        });

    });

    describe("facet inheritance down restriction chains", () => {

        function st(name: string, facets: ReadonlyArray<Facet>, base: SimpleTypeDefinition | null = null, ws: WhiteSpaceValue = "preserve", eff: ReadonlyArray<Facet> = facets): SimpleTypeDefinition {
            return { kind: "simple-type", name: { namespaceURI: null, localName: name }, variety: "atomic", itemType: null, memberTypes: [], facets, baseType: base, whiteSpace: ws, effectiveFacets: eff };
        }

        it("derived type overrides base facet of the same kind", () => {
            const base = st("Base", [{ kind: "length", value: "5" }], null);
            const derived = st("Derived", [{ kind: "length", value: "3" }], base);
            const eff = computeEffectiveFacets(derived.facets, base);
            expect(eff).toEqual([{ kind: "length", value: "3" }]);
        });

        it("derived type inherits base facets for kinds it does not specify", () => {
            const base = st("Base", [{ kind: "length", value: "5" }], null);
            const derived = st("Derived", [{ kind: "minLength", value: "1" }], base);
            const eff = computeEffectiveFacets(derived.facets, base);
            expect(eff).toContainEqual({ kind: "length", value: "5" });
            expect(eff).toContainEqual({ kind: "minLength", value: "1" });
        });

        it("patterns accumulate across the chain", () => {
            const base = st("Base", [{ kind: "pattern", value: "[a-z]+" }], null);
            const derived = st("Derived", [{ kind: "pattern", value: "[0-9]+" }], base);
            const eff = computeEffectiveFacets(derived.facets, base);
            const patterns = eff.filter((f) => f.kind === "pattern");
            expect(patterns).toEqual([
                { kind: "pattern", value: "[a-z]+" },
                { kind: "pattern", value: "[0-9]+" },
            ]);
        });

        it("derived enumeration replaces the base enumeration", () => {
            const base = st("Base", [{ kind: "enumeration", value: "red" }, { kind: "enumeration", value: "green" }], null);
            const derived = st("Derived", [{ kind: "enumeration", value: "blue" }], base);
            const eff = computeEffectiveFacets(derived.facets, base);
            expect(eff.filter((f) => f.kind === "enumeration")).toEqual([
                { kind: "enumeration", value: "blue" },
            ]);
        });

        it("whiteSpace is inherited from the base when not specified", () => {
            const base = st("Base", [], null, "collapse");
            expect(computeWhiteSpace([], base)).toBe("collapse");
            expect(computeWhiteSpace([{ kind: "whiteSpace", value: "replace" }], base)).toBe("replace");
        });

        it("deep chain: grandchild inherits through the middle type", () => {
            const base = st("Base", [{ kind: "length", value: "5" }], null);
            const mid = st("Mid", [{ kind: "minLength", value: "2" }], base);
            const top = st("Top", [{ kind: "maxLength", value: "8" }], mid);
            const midEff = computeEffectiveFacets(mid.facets, base);
            const topEff = computeEffectiveFacets(top.facets, st("Mid", mid.facets, base, "preserve", midEff));
            expect(topEff).toContainEqual({ kind: "length", value: "5" });
            expect(topEff).toContainEqual({ kind: "minLength", value: "2" });
            expect(topEff).toContainEqual({ kind: "maxLength", value: "8" });
        });

    });

    describe("facet validation", () => {

        function violations(normalized: string, facets: Facet[]): FacetViolation[] {
            return validateFacets(normalized, facets);
        }

        it("length: exact code-point count", () => {
            expect(violations("ab", [{ kind: "length", value: "2" }])).toHaveLength(0);
            expect(violations("abc", [{ kind: "length", value: "2" }])).toHaveLength(1);
            // Supplementary character counts as one
            expect(violations("😀", [{ kind: "length", value: "1" }])).toHaveLength(0);
            expect(violations("😀", [{ kind: "length", value: "2" }])).toHaveLength(1);
        });

        it("minLength / maxLength", () => {
            expect(violations("abc", [{ kind: "minLength", value: "2" }])).toHaveLength(0);
            expect(violations("a", [{ kind: "minLength", value: "2" }])).toHaveLength(1);
            expect(violations("abc", [{ kind: "maxLength", value: "5" }])).toHaveLength(0);
            expect(violations("abcdef", [{ kind: "maxLength", value: "5" }])).toHaveLength(1);
        });

        it("enumeration: value must match one of the enumerated values", () => {
            const enums: Facet[] = [
                { kind: "enumeration", value: "red" },
                { kind: "enumeration", value: "green" },
            ];
            expect(violations("red", enums)).toHaveLength(0);
            expect(violations("blue", enums)).toHaveLength(1);
        });

        it("multiple facets can be violated at once", () => {
            const facets: Facet[] = [
                { kind: "length", value: "3" },
                { kind: "enumeration", value: "abc" },
            ];
            expect(violations("xyz", facets)).toHaveLength(1); // length ok, enumeration fails
            expect(violations("abcd", facets)).toHaveLength(2); // both length and enumeration fail
            expect(violations("abc", facets)).toHaveLength(0);
        });

        it("numeric bound facets are attached but not evaluated (CHK-012)", () => {
            expect(violations("0", [{ kind: "minInclusive", value: "1" }])).toHaveLength(0);
            expect(violations("abc", [{ kind: "pattern", value: "[a-z]+" }])).toHaveLength(0); // CHK-015
        });

    });

});
