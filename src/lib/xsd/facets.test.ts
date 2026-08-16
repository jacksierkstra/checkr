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
    splitListItems,
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
            return { kind: "simple-type", name: { namespaceURI: null, localName: name }, variety: "atomic", itemType: null, memberTypes: [], itemTypeDef: null, memberTypeDefs: [], facets, baseType: base, whiteSpace: ws, effectiveFacets: eff, final: "", annotations: [] };
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

        function violations(normalized: string, facets: Facet[], type?: SimpleTypeDefinition | null): FacetViolation[] {
            return validateFacets(normalized, facets, type);
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

        it("numeric bound facets are evaluated when a type is provided (CHK-012)", () => {
            const decimalType: SimpleTypeDefinition = {
                kind: "simple-type",
                name: { namespaceURI: "http://www.w3.org/2001/XMLSchema", localName: "decimal" },
                variety: "atomic",
                itemType: null,
                memberTypes: [],
                itemTypeDef: null,
                memberTypeDefs: [],
                facets: [],
                baseType: null,
                whiteSpace: "collapse",
                effectiveFacets: [], final: "",
        annotations: [],
            };
            // Without type: skipped
            expect(violations("0", [{ kind: "minInclusive", value: "1" }])).toHaveLength(0);
            // With type: evaluated
            expect(violations("0", [{ kind: "minInclusive", value: "1" }], decimalType)).toHaveLength(1);
            expect(violations("1", [{ kind: "minInclusive", value: "1" }], decimalType)).toHaveLength(0);
            expect(violations("abc", [{ kind: "pattern", value: "[a-z]+" }])).toHaveLength(0); // CHK-015
        });

        it("totalDigits facet evaluated when type is decimal", () => {
            const decimalType: SimpleTypeDefinition = {
                kind: "simple-type",
                name: { namespaceURI: "http://www.w3.org/2001/XMLSchema", localName: "decimal" },
                variety: "atomic",
                itemType: null,
                memberTypes: [],
                itemTypeDef: null,
                memberTypeDefs: [],
                facets: [],
                baseType: null,
                whiteSpace: "collapse",
                effectiveFacets: [], final: "",
        annotations: [],
            };
            expect(violations("123", [{ kind: "totalDigits", value: "3" }], decimalType)).toHaveLength(0);
            expect(violations("1234", [{ kind: "totalDigits", value: "3" }], decimalType)).toHaveLength(1);
        });

        it("fractionDigits facet evaluated when type is decimal", () => {
            const decimalType: SimpleTypeDefinition = {
                kind: "simple-type",
                name: { namespaceURI: "http://www.w3.org/2001/XMLSchema", localName: "decimal" },
                variety: "atomic",
                itemType: null,
                memberTypes: [],
                itemTypeDef: null,
                memberTypeDefs: [],
                facets: [],
                baseType: null,
                whiteSpace: "collapse",
                effectiveFacets: [], final: "",
        annotations: [],
            };
            expect(violations("1.23", [{ kind: "fractionDigits", value: "2" }], decimalType)).toHaveLength(0);
            expect(violations("1.234", [{ kind: "fractionDigits", value: "2" }], decimalType)).toHaveLength(1);
        });

    });

});

describe("list-aware facet semantics (CHK-016)", () => {

    function listType(itemType: SimpleTypeDefinition | null, whiteSpace: WhiteSpaceValue = "collapse"): SimpleTypeDefinition {
        return {
            kind: "simple-type",
            name: null,
            variety: "list",
            itemType: itemType?.name ?? null,
            memberTypes: [],
            itemTypeDef: itemType,
            memberTypeDefs: [],
            facets: [],
            baseType: null,
            whiteSpace,
            effectiveFacets: [], final: "",
        annotations: [],
        };
    }

    it("splitListItems splits on whitespace and treats the empty string as an empty list", () => {
        expect(splitListItems("1 2 3")).toEqual(["1", "2", "3"]);
        expect(splitListItems("a b")).toEqual(["a", "b"]);
        expect(splitListItems("single")).toEqual(["single"]);
        expect(splitListItems("")).toEqual([]);
    });

    it("length/minLength/maxLength measure the item count of a list", () => {
        const t = listType(null);
        expect(validateFacets("1 2", [{ kind: "length", value: "2" }], t)).toHaveLength(0);
        expect(validateFacets("1 2 3", [{ kind: "length", value: "2" }], t)).toHaveLength(1);
        expect(validateFacets("1", [{ kind: "minLength", value: "2" }], t)).toHaveLength(1);
        expect(validateFacets("1 2 3", [{ kind: "maxLength", value: "2" }], t)).toHaveLength(1);
    });

    it("length facets on a list do not count code points of the whole form", () => {
        const t = listType(null);
        // "1 2 3" is 5 code points but 3 items: length=3 must pass.
        expect(validateFacets("1 2 3", [{ kind: "length", value: "3" }], t)).toHaveLength(0);
    });

    it("enumeration compares list values item-wise after splitting", () => {
        const t = listType(null);
        const enums: Facet[] = [{ kind: "enumeration", value: "1 2 3" }];
        expect(validateFacets("1 2 3", enums, t)).toHaveLength(0);
        // Even with irregular whitespace in the facet value, item-wise
        // comparison matches once both sides are split.
        expect(validateFacets("1 2 3", [{ kind: "enumeration", value: " 1   2  3 " }], t)).toHaveLength(0);
        expect(validateFacets("1 2", enums, t)).toHaveLength(1);
        expect(validateFacets("1 2 4", enums, t)).toHaveLength(1);
    });

    it("enumeration on atomic types still compares the literal string", () => {
        expect(validateFacets("red", [{ kind: "enumeration", value: "red" }], null)).toHaveLength(0);
        expect(validateFacets("red", [{ kind: "enumeration", value: " red " }], null)).toHaveLength(1);
    });

});