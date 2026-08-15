/**
 * Tests for numeric-family lexical-space validators and value-space
 * comparison (CHK-012).
 */

import {
    isValidDecimalLexical,
    isValidIntegerLexical,
    isValidFloatLexical,
    parseDecimal,
    parseFloatingPoint,
    compareDecimal,
    compareFloatingPoint,
    comparePositiveMagnitude,
    decimalTotalDigits,
    decimalFractionDigits,
    numericValueSpaceOf,
    isIntegerFamily,
    checkNumericFamilyLexicalSpace,
    evaluateNumericFacet,
    CanonicalDecimal,
} from "@lib/xsd/numeric-types";
import { SimpleTypeDefinition } from "@lib/types/component-graph";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function builtin(localName: string): SimpleTypeDefinition {
    return {
        kind: "simple-type",
        name: { namespaceURI: "http://www.w3.org/2001/XMLSchema", localName },
        variety: "atomic",
        itemType: null,
        memberTypes: [],
        facets: [],
        baseType: null,
        whiteSpace: "collapse",
        effectiveFacets: [],
    };
}

function derivedSt(localName: string, baseType: SimpleTypeDefinition | null): SimpleTypeDefinition {
    return {
        kind: "simple-type",
        name: { namespaceURI: null, localName },
        variety: "atomic",
        itemType: baseType?.name ?? null,
        memberTypes: [],
        facets: [],
        baseType,
        whiteSpace: baseType?.whiteSpace ?? "preserve",
        effectiveFacets: [],
    };
}

// Chain helper: build [type, base, grandbase...] top-down
function chain(...names: string[]): SimpleTypeDefinition {
    let base: SimpleTypeDefinition | null = null;
    for (let i = names.length - 1; i >= 0; i--) {
        base = derivedSt(names[i]!, base);
    }
    return base!;
}

// ---------------------------------------------------------------------------
// decimal lexical
// ---------------------------------------------------------------------------

describe("isValidDecimalLexical", () => {

    it("accepts simple whole numbers", () => {
        expect(isValidDecimalLexical("0")).toBe(true);
        expect(isValidDecimalLexical("1")).toBe(true);
        expect(isValidDecimalLexical("123")).toBe(true);
    });

    it("accepts signed numbers", () => {
        expect(isValidDecimalLexical("+1")).toBe(true);
        expect(isValidDecimalLexical("-1")).toBe(true);
        expect(isValidDecimalLexical("+0")).toBe(true);
        expect(isValidDecimalLexical("-0")).toBe(true);
    });

    it("accepts decimal point forms", () => {
        expect(isValidDecimalLexical("1.5")).toBe(true);
        expect(isValidDecimalLexical(".5")).toBe(true);
        expect(isValidDecimalLexical("1.")).toBe(true);
        expect(isValidDecimalLexical("0.0")).toBe(true);
        expect(isValidDecimalLexical(".0")).toBe(true);
    });

    it("accepts leading and trailing zeros", () => {
        expect(isValidDecimalLexical("007")).toBe(true);
        expect(isValidDecimalLexical("1.50")).toBe(true);
        expect(isValidDecimalLexical("00.00100")).toBe(true);
    });

    it("rejects empty string", () => {
        expect(isValidDecimalLexical("")).toBe(false);
    });

    it("rejects bare dot", () => {
        expect(isValidDecimalLexical(".")).toBe(false);
    });

    it("rejects multiple dots", () => {
        expect(isValidDecimalLexical("1.2.3")).toBe(false);
    });

    it("rejects non-numeric", () => {
        expect(isValidDecimalLexical("abc")).toBe(false);
        expect(isValidDecimalLexical("1a")).toBe(false);
    });

    it("rejects exponent notation (not decimal)", () => {
        expect(isValidDecimalLexical("1e5")).toBe(false);
        expect(isValidDecimalLexical("1.5E3")).toBe(false);
    });

    it("rejects special values", () => {
        expect(isValidDecimalLexical("INF")).toBe(false);
        expect(isValidDecimalLexical("NaN")).toBe(false);
    });

    it("rejects commas", () => {
        expect(isValidDecimalLexical("1,5")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// integer lexical
// ---------------------------------------------------------------------------

describe("isValidIntegerLexical", () => {

    it("accepts whole numbers", () => {
        expect(isValidIntegerLexical("0")).toBe(true);
        expect(isValidIntegerLexical("1")).toBe(true);
        expect(isValidIntegerLexical("123")).toBe(true);
        expect(isValidIntegerLexical("007")).toBe(true);
    });

    it("accepts signed integers", () => {
        expect(isValidIntegerLexical("+1")).toBe(true);
        expect(isValidIntegerLexical("-1")).toBe(true);
    });

    it("rejects decimal point", () => {
        expect(isValidIntegerLexical("1.0")).toBe(false);
        expect(isValidIntegerLexical("1.")).toBe(false);
        expect(isValidIntegerLexical(".5")).toBe(false);
    });

    it("rejects exponents", () => {
        expect(isValidIntegerLexical("1e5")).toBe(false);
    });

    it("rejects non-numeric", () => {
        expect(isValidIntegerLexical("abc")).toBe(false);
        expect(isValidIntegerLexical("")).toBe(false);
        expect(isValidIntegerLexical("1a")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// float/double lexical
// ---------------------------------------------------------------------------

describe("isValidFloatLexical", () => {

    it("accepts decimal forms", () => {
        expect(isValidFloatLexical("1.5")).toBe(true);
        expect(isValidFloatLexical(".5")).toBe(true);
        expect(isValidFloatLexical("1.")).toBe(true);
        expect(isValidFloatLexical("0")).toBe(true);
    });

    it("accepts exponential notation", () => {
        expect(isValidFloatLexical("1.5e3")).toBe(true);
        expect(isValidFloatLexical("1.5E3")).toBe(true);
        expect(isValidFloatLexical("1e5")).toBe(true);
        expect(isValidFloatLexical("1.5E-3")).toBe(true);
        expect(isValidFloatLexical("1e+10")).toBe(true);
        expect(isValidFloatLexical("1.5e+2")).toBe(true);
    });

    it("accepts signed mantissa", () => {
        expect(isValidFloatLexical("-1.5")).toBe(true);
        expect(isValidFloatLexical("+1.5")).toBe(true);
        expect(isValidFloatLexical("-1.5e3")).toBe(true);
        expect(isValidFloatLexical("+1.5e3")).toBe(true);
    });

    it("accepts special values", () => {
        expect(isValidFloatLexical("INF")).toBe(true);
        expect(isValidFloatLexical("-INF")).toBe(true);
        expect(isValidFloatLexical("NaN")).toBe(true);
    });

    it("rejects case-variant special values", () => {
        expect(isValidFloatLexical("inf")).toBe(false);
        expect(isValidFloatLexical("-inf")).toBe(false);
        expect(isValidFloatLexical("nan")).toBe(false);
        expect(isValidFloatLexical("Infinity")).toBe(false);
    });

    it("rejects malformed special values", () => {
        expect(isValidFloatLexical("+INF")).toBe(false);
        expect(isValidFloatLexical("+NaN")).toBe(false);
    });

    it("rejects empty string", () => {
        expect(isValidFloatLexical("")).toBe(false);
    });

    it("rejects bare dot", () => {
        expect(isValidFloatLexical(".")).toBe(false);
    });

    it("rejects missing exponent digits", () => {
        expect(isValidFloatLexical("1e")).toBe(false);
        expect(isValidFloatLexical("1.5e+")).toBe(false);
    });

    it("rejects exponent without mantissa", () => {
        expect(isValidFloatLexical("e5")).toBe(false);
    });

    it("rejects non-numeric", () => {
        expect(isValidFloatLexical("abc")).toBe(false);
        expect(isValidFloatLexical("1,5")).toBe(false);
        expect(isValidFloatLexical("1.2.3")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// parseDecimal
// ---------------------------------------------------------------------------

describe("parseDecimal", () => {

    it("canonicalises '1.0' to {1,'1',''}", () => {
        const v = parseDecimal("1.0")!;
        expect(v.sign).toBe(1);
        expect(v.intDigits).toBe("1");
        expect(v.fracDigits).toBe("");
    });

    it("canonicalises '0.00123' to {1,'0','00123'}", () => {
        const v = parseDecimal("0.00123")!;
        expect(v.intDigits).toBe("0");
        expect(v.fracDigits).toBe("00123");
    });

    it("canonicalises '-007.500' to {-1,'7','5'}", () => {
        const v = parseDecimal("-007.500")!;
        expect(v.sign).toBe(-1);
        expect(v.intDigits).toBe("7");
        expect(v.fracDigits).toBe("5");
    });

    it("canonicalises '100' to {1,'100',''}", () => {
        const v = parseDecimal("100")!;
        expect(v.intDigits).toBe("100");
        expect(v.fracDigits).toBe("");
    });

    it("canonicalises '+0' to zero {1,'0',''}", () => {
        const v = parseDecimal("+0")!;
        expect(v.sign).toBe(1);
        expect(v.intDigits).toBe("0");
        expect(v.fracDigits).toBe("");
    });

    it("canonicalises '-0' to zero {1,'0',''}", () => {
        const v = parseDecimal("-0")!;
        expect(v.sign).toBe(1);
        expect(v.intDigits).toBe("0");
        expect(v.fracDigits).toBe("");
    });

    it("canonicalises '.5' to {1,'0','5'}", () => {
        const v = parseDecimal(".5")!;
        expect(v.intDigits).toBe("0");
        expect(v.fracDigits).toBe("5");
    });

    it("canonicalises '1.' to {1,'1',''}", () => {
        const v = parseDecimal("1.")!;
        expect(v.intDigits).toBe("1");
        expect(v.fracDigits).toBe("");
    });

    it("returns null for invalid input", () => {
        expect(parseDecimal("abc")).toBeNull();
        expect(parseDecimal("")).toBeNull();
    });

});

// ---------------------------------------------------------------------------
// compareDecimal / comparePositiveMagnitude
// ---------------------------------------------------------------------------

describe("compareDecimal", () => {

    function cd(sign: 1 | -1, intDigits: string, fracDigits: string): CanonicalDecimal {
        return { sign, intDigits, fracDigits };
    }

    it("1 < 2", () => {
        expect(compareDecimal(cd(1, "1", ""), cd(1, "2", ""))).toBe(-1);
    });

    it("2 > 1", () => {
        expect(compareDecimal(cd(1, "2", ""), cd(1, "1", ""))).toBe(1);
    });

    it("-1 < 1", () => {
        expect(compareDecimal(cd(-1, "1", ""), cd(1, "1", ""))).toBe(-1);
    });

    it("1.5 < 1.55", () => {
        expect(compareDecimal(cd(1, "1", "5"), cd(1, "1", "55"))).toBe(-1);
    });

    it("-1.55 < -1.5 (more negative)", () => {
        expect(compareDecimal(cd(-1, "1", "55"), cd(-1, "1", "5"))).toBe(-1);
    });

    it("-1.5 > -1.55", () => {
        expect(compareDecimal(cd(-1, "1", "5"), cd(-1, "1", "55"))).toBe(1);
    });

    it("1.0 == 1", () => {
        expect(compareDecimal(cd(1, "1", ""), cd(1, "1", ""))).toBe(0);
    });

    it("0 == -0", () => {
        expect(compareDecimal(cd(1, "0", ""), cd(1, "0", ""))).toBe(0);
    });

    it("10 > 9", () => {
        expect(compareDecimal(cd(1, "10", ""), cd(1, "9", ""))).toBe(1);
    });

    it("0.001 < 0.01", () => {
        expect(compareDecimal(cd(1, "0", "001"), cd(1, "0", "01"))).toBe(-1);
    });

    it("0.01 > 0.001", () => {
        expect(compareDecimal(cd(1, "0", "01"), cd(1, "0", "001"))).toBe(1);
    });

    it("100 > 99", () => {
        expect(compareDecimal(cd(1, "100", ""), cd(1, "99", ""))).toBe(1);
    });

    it("lots of digits compares correctly", () => {
        const big = cd(1, "123456789", "");
        const bigger = cd(1, "987654321", "");
        expect(compareDecimal(big, bigger)).toBe(-1);
    });

});

// ---------------------------------------------------------------------------
// totalDigits / fractionDigits
// ---------------------------------------------------------------------------

describe("decimalTotalDigits / decimalFractionDigits", () => {

    function cd(sign: 1 | -1, intDigits: string, fracDigits: string): CanonicalDecimal {
        return { sign, intDigits, fracDigits };
    }

    it("totalDigits('100') = 3", () => {
        expect(decimalTotalDigits(cd(1, "100", ""))).toBe(3);
    });

    it("totalDigits('0.00123') = 3", () => {
        expect(decimalTotalDigits(cd(1, "0", "00123"))).toBe(3);
    });

    it("totalDigits('0') = 1", () => {
        expect(decimalTotalDigits(cd(1, "0", ""))).toBe(1);
    });

    it("totalDigits('1.50') = 2 (canonical '1.5')", () => {
        expect(decimalTotalDigits(cd(1, "1", "5"))).toBe(2);
    });

    it("totalDigits('10.5') = 3", () => {
        expect(decimalTotalDigits(cd(1, "10", "5"))).toBe(3);
    });

    it("fractionDigits('0.00123') = 5", () => {
        expect(decimalFractionDigits(cd(1, "0", "00123"))).toBe(5);
    });

    it("fractionDigits('0') = 0", () => {
        expect(decimalFractionDigits(cd(1, "0", ""))).toBe(0);
    });

    it("fractionDigits('10.5') = 1", () => {
        expect(decimalFractionDigits(cd(1, "10", "5"))).toBe(1);
    });

    it("fractionDigits('1.5') = 1", () => {
        expect(decimalFractionDigits(cd(1, "1", "5"))).toBe(1);
    });

    it("fractionDigits('1.50') canonical = 1", () => {
        expect(decimalFractionDigits(cd(1, "1", "5"))).toBe(1);
    });

});

// ---------------------------------------------------------------------------
// compareFloatingPoint
// ---------------------------------------------------------------------------

describe("compareFloatingPoint", () => {

    it("returns -1 for 1 < 2", () => {
        expect(compareFloatingPoint(1, 2)).toBe(-1);
    });

    it("returns 1 for 2 > 1", () => {
        expect(compareFloatingPoint(2, 1)).toBe(1);
    });

    it("returns 0 for equal values", () => {
        expect(compareFloatingPoint(1.5, 1.5)).toBe(0);
    });

    it("treats -0 and 0 as equal", () => {
        expect(compareFloatingPoint(0, -0)).toBe(0);
    });

    it("compares Infinity", () => {
        expect(compareFloatingPoint(Infinity, 1e308)).toBe(1);
        expect(compareFloatingPoint(-Infinity, -1e308)).toBe(-1);
    });

    it("returns unordered when either value is NaN", () => {
        expect(compareFloatingPoint(NaN, 1)).toBe("unordered");
        expect(compareFloatingPoint(1, NaN)).toBe("unordered");
        expect(compareFloatingPoint(NaN, NaN)).toBe("unordered");
    });

});

// ---------------------------------------------------------------------------
// parseFloatingPoint
// ---------------------------------------------------------------------------

describe("parseFloatingPoint", () => {

    it("parses regular numbers", () => {
        expect(parseFloatingPoint("1.5")).toBe(1.5);
        expect(parseFloatingPoint("-1.5e3")).toBe(-1500);
    });

    it("parses special values", () => {
        expect(parseFloatingPoint("INF")).toBe(Infinity);
        expect(parseFloatingPoint("-INF")).toBe(-Infinity);
        expect(parseFloatingPoint("NaN")).toBeNaN();
    });

    it("returns null for invalid input", () => {
        expect(parseFloatingPoint("abc")).toBeNull();
        expect(parseFloatingPoint("1,5")).toBeNull();
    });

});

// ---------------------------------------------------------------------------
// numericValueSpaceOf / isIntegerFamily
// ---------------------------------------------------------------------------

describe("numericValueSpaceOf", () => {

    it("returns 'decimal' for decimal", () => {
        expect(numericValueSpaceOf(builtin("decimal"))).toBe("decimal");
    });

    it("returns 'decimal' for integer", () => {
        expect(numericValueSpaceOf(builtin("integer"))).toBe("decimal");
    });

    it("returns 'decimal' for int", () => {
        expect(numericValueSpaceOf(builtin("int"))).toBe("decimal");
    });

    it("returns 'float' for float", () => {
        expect(numericValueSpaceOf(builtin("float"))).toBe("float");
    });

    it("returns 'double' for double", () => {
        expect(numericValueSpaceOf(builtin("double"))).toBe("double");
    });

    it("returns null for string", () => {
        expect(numericValueSpaceOf(builtin("string"))).toBeNull();
    });

    it("returns null for anySimpleType", () => {
        expect(numericValueSpaceOf(builtin("anySimpleType"))).toBeNull();
    });

    it("walks base chain for user types", () => {
        const base = builtin("int");
        const t = derivedSt("MyInt", base);
        expect(numericValueSpaceOf(t)).toBe("decimal");
    });

    it("walks base chain for float restriction", () => {
        const base = builtin("float");
        const t = derivedSt("MyFloat", base);
        expect(numericValueSpaceOf(t)).toBe("float");
    });

});

describe("isIntegerFamily", () => {

    it("returns true for integer-family builtins", () => {
        expect(isIntegerFamily(builtin("integer"))).toBe(true);
        expect(isIntegerFamily(builtin("int"))).toBe(true);
        expect(isIntegerFamily(builtin("nonNegativeInteger"))).toBe(true);
        expect(isIntegerFamily(builtin("positiveInteger"))).toBe(true);
    });

    it("returns false for decimal", () => {
        expect(isIntegerFamily(builtin("decimal"))).toBe(false);
    });

    it("returns false for string", () => {
        expect(isIntegerFamily(builtin("string"))).toBe(false);
    });

    it("walks base chain for user type derived from integer", () => {
        const base = builtin("nonNegativeInteger");
        const t = derivedSt("MyNonNeg", base);
        expect(isIntegerFamily(t)).toBe(true);
    });

    it("returns false for decimal-derived user type", () => {
        const base = builtin("decimal");
        const t = derivedSt("MyDec", base);
        expect(isIntegerFamily(t)).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// checkNumericFamilyLexicalSpace
// ---------------------------------------------------------------------------

describe("checkNumericFamilyLexicalSpace", () => {

    it("returns null for non-numeric types", () => {
        expect(checkNumericFamilyLexicalSpace("123", builtin("string"))).toBeNull();
    });

    describe("decimal family", () => {

        it("accepts valid decimal", () => {
            expect(checkNumericFamilyLexicalSpace("123.45", builtin("decimal"))).toBeNull();
            expect(checkNumericFamilyLexicalSpace("-0.5", builtin("decimal"))).toBeNull();
        });

        it("rejects invalid decimal", () => {
            expect(checkNumericFamilyLexicalSpace("1e5", builtin("decimal"))).not.toBeNull();
            expect(checkNumericFamilyLexicalSpace("abc", builtin("decimal"))).not.toBeNull();
        });

        it("rejects exponent on decimal", () => {
            const msg = checkNumericFamilyLexicalSpace("1.5e3", builtin("decimal"));
            expect(msg).not.toBeNull();
        });

    });

    describe("integer family", () => {

        it("accepts valid integer", () => {
            expect(checkNumericFamilyLexicalSpace("123", builtin("integer"))).toBeNull();
            expect(checkNumericFamilyLexicalSpace("-7", builtin("int"))).toBeNull();
        });

        it("rejects decimal point", () => {
            expect(checkNumericFamilyLexicalSpace("1.0", builtin("integer"))).not.toBeNull();
            expect(checkNumericFamilyLexicalSpace("1.5", builtin("int"))).not.toBeNull();
        });

        it("rejects non-numeric for integer", () => {
            expect(checkNumericFamilyLexicalSpace("abc", builtin("integer"))).not.toBeNull();
        });

        it("walks chain for user type derived from integer", () => {
            const base = builtin("int");
            const t = derivedSt("MyInt", base);
            expect(checkNumericFamilyLexicalSpace("1.5", t)).not.toBeNull();
            expect(checkNumericFamilyLexicalSpace("42", t)).toBeNull();
        });

    });

    describe("float family", () => {

        it("accepts valid float", () => {
            expect(checkNumericFamilyLexicalSpace("1.5", builtin("float"))).toBeNull();
            expect(checkNumericFamilyLexicalSpace("1.5e3", builtin("float"))).toBeNull();
            expect(checkNumericFamilyLexicalSpace("INF", builtin("float"))).toBeNull();
            expect(checkNumericFamilyLexicalSpace("-INF", builtin("float"))).toBeNull();
            expect(checkNumericFamilyLexicalSpace("NaN", builtin("float"))).toBeNull();
        });

        it("rejects invalid float", () => {
            expect(checkNumericFamilyLexicalSpace("abc", builtin("float"))).not.toBeNull();
            expect(checkNumericFamilyLexicalSpace("inf", builtin("float"))).not.toBeNull();
            expect(checkNumericFamilyLexicalSpace("+INF", builtin("float"))).not.toBeNull();
        });

    });

});

// ---------------------------------------------------------------------------
// evaluateNumericFacet — bound facets
// ---------------------------------------------------------------------------

describe("evaluateNumericFacet (bound facets)", () => {

    it("minInclusive decimal: value >= bound passes", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("5", "minInclusive", "5", t)).toBeNull();
        expect(evaluateNumericFacet("5", "minInclusive", "3", t)).toBeNull();
        expect(evaluateNumericFacet("5", "minInclusive", "6", t)).not.toBeNull();
    });

    it("maxInclusive decimal: value <= bound passes", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("5", "maxInclusive", "5", t)).toBeNull();
        expect(evaluateNumericFacet("5", "maxInclusive", "10", t)).toBeNull();
        expect(evaluateNumericFacet("5", "maxInclusive", "3", t)).not.toBeNull();
    });

    it("minExclusive decimal: value > bound passes", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("5", "minExclusive", "4", t)).toBeNull();
        expect(evaluateNumericFacet("5", "minExclusive", "5", t)).not.toBeNull();
    });

    it("maxExclusive decimal: value < bound passes", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("5", "maxExclusive", "10", t)).toBeNull();
        expect(evaluateNumericFacet("5", "maxExclusive", "5", t)).not.toBeNull();
    });

    it("minInclusive float: uses IEEE comparison", () => {
        const t = builtin("float");
        // fround: closest float to 0.1
        expect(evaluateNumericFacet("0.1", "minInclusive", "0.1", t)).toBeNull();
        expect(evaluateNumericFacet("0", "minInclusive", "0", t)).toBeNull();
        // 0 < 0.1
        expect(evaluateNumericFacet("0", "minInclusive", "0.1", t)).not.toBeNull();
    });

    it("NaN violates all bounds on float", () => {
        const t = builtin("float");
        expect(evaluateNumericFacet("NaN", "minInclusive", "0", t)).not.toBeNull();
        expect(evaluateNumericFacet("NaN", "maxInclusive", "0", t)).not.toBeNull();
        expect(evaluateNumericFacet("NaN", "minExclusive", "0", t)).not.toBeNull();
        expect(evaluateNumericFacet("NaN", "maxExclusive", "0", t)).not.toBeNull();
    });

    it("INF comparisons work correctly on float", () => {
        const t = builtin("float");
        expect(evaluateNumericFacet("INF", "minInclusive", "1e10", t)).toBeNull();
        expect(evaluateNumericFacet("INF", "maxInclusive", "1e10", t)).not.toBeNull();
        expect(evaluateNumericFacet("INF", "maxInclusive", "INF", t)).toBeNull();
    });

    it("walks chain for user type", () => {
        const base = builtin("int"); // int has minInclusive=-2147483648
        const t = derivedSt("MyInt", base);
        expect(evaluateNumericFacet("0", "minInclusive", "0", t)).toBeNull();
        expect(evaluateNumericFacet("-3000000000", "minInclusive", "-2147483648", t)).not.toBeNull();
    });

    it("returns null for non-numeric types", () => {
        const t = builtin("string");
        expect(evaluateNumericFacet("5", "minInclusive", "3", t)).toBeNull();
    });

});

// ---------------------------------------------------------------------------
// evaluateNumericFacet — scale facets (totalDigits / fractionDigits)
// ---------------------------------------------------------------------------

describe("evaluateNumericFacet (scale facets)", () => {

    it("totalDigits rejects values with too many digits", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("123", "totalDigits", "3", t)).toBeNull();
        expect(evaluateNumericFacet("1234", "totalDigits", "3", t)).not.toBeNull();
    });

    it("totalDigits counts significant digits for leading zeros", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("0.00123", "totalDigits", "3", t)).toBeNull();
        expect(evaluateNumericFacet("0.00123", "totalDigits", "2", t)).not.toBeNull();
    });

    it("totalDigits value 0 has 1 digit", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("0", "totalDigits", "1", t)).toBeNull();
    });

    it("fractionDigits rejects too many fractional digits", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("1.23", "fractionDigits", "2", t)).toBeNull();
        expect(evaluateNumericFacet("1.234", "fractionDigits", "2", t)).not.toBeNull();
    });

    it("fractionDigits counts leading zeros in fraction", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("0.00123", "fractionDigits", "5", t)).toBeNull();
        expect(evaluateNumericFacet("0.00123", "fractionDigits", "3", t)).not.toBeNull();
    });

    it("fractionDigits zero value has 0 fractional digits", () => {
        const t = builtin("decimal");
        expect(evaluateNumericFacet("0", "fractionDigits", "0", t)).toBeNull();
    });

    it("returns null for float/double types (scale facets not applicable)", () => {
        const t = builtin("float");
        expect(evaluateNumericFacet("123", "totalDigits", "2", t)).toBeNull();
    });

    it("returns null for non-numeric types", () => {
        const t = builtin("string");
        expect(evaluateNumericFacet("123", "totalDigits", "2", t)).toBeNull();
    });

});

// ---------------------------------------------------------------------------
// Integer bound specifics (int, long, byte, etc.)
// ---------------------------------------------------------------------------

describe("checkNumericFamilyLexicalSpace for integer family with bounds", () => {

    it("int: lexical form is correct (integer only)", () => {
        expect(checkNumericFamilyLexicalSpace("42", builtin("int"))).toBeNull();
        expect(checkNumericFamilyLexicalSpace("+0", builtin("int"))).toBeNull();
    });

    it("int rejects decimal point", () => {
        expect(checkNumericFamilyLexicalSpace("42.0", builtin("int"))).not.toBeNull();
    });

});