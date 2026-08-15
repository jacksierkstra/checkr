/**
 * Tests for remaining-family built-in type lexical-space validators (CHK-014).
 *
 * Covers: boolean, hexBinary, base64Binary, anyURI, QName, NOTATION.
 */

import {
    isValidBoolean,
    isValidHexBinary,
    isValidBase64Binary,
    isValidAnyURI,
    isValidQNameLexical,
    checkRemainingFamilyLexicalSpace,
    hexBinaryOctetLength,
    base64BinaryOctetLength,
    binaryOctetLength,
} from "@lib/xsd/remaining-types";
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

function derivedSt(
    localName: string,
    baseType: SimpleTypeDefinition | null,
): SimpleTypeDefinition {
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

// ---------------------------------------------------------------------------
// boolean
// ---------------------------------------------------------------------------

describe("isValidBoolean", () => {
    it("accepts 'true'", () => {
        expect(isValidBoolean("true")).toBe(true);
    });

    it("accepts 'false'", () => {
        expect(isValidBoolean("false")).toBe(true);
    });

    it("accepts '1'", () => {
        expect(isValidBoolean("1")).toBe(true);
    });

    it("accepts '0'", () => {
        expect(isValidBoolean("0")).toBe(true);
    });

    it("rejects other strings", () => {
        expect(isValidBoolean("yes")).toBe(false);
        expect(isValidBoolean("no")).toBe(false);
        expect(isValidBoolean("TRUE")).toBe(false);
        expect(isValidBoolean("True")).toBe(false);
        expect(isValidBoolean("")).toBe(false);
        expect(isValidBoolean(" ")).toBe(false);
        expect(isValidBoolean("2")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// hexBinary
// ---------------------------------------------------------------------------

describe("isValidHexBinary", () => {
    it("accepts empty string (zero octets)", () => {
        expect(isValidHexBinary("")).toBe(true);
    });

    it("accepts an even-length hex string", () => {
        expect(isValidHexBinary("0FB7")).toBe(true);
        expect(isValidHexBinary("deadbeef")).toBe(true);
        expect(isValidHexBinary("ABCDEFab")).toBe(true);
    });

    it("rejects odd-length hex strings", () => {
        expect(isValidHexBinary("0FB")).toBe(false);
        expect(isValidHexBinary("a")).toBe(false);
    });

    it("rejects non-hex characters", () => {
        expect(isValidHexBinary("0FGH")).toBe(false);
        expect(isValidHexBinary("0F Z")).toBe(false);
    });

    it("rejects internal whitespace", () => {
        expect(isValidHexBinary("0F 1A")).toBe(false);
    });

    it("handles both upper and lower case", () => {
        expect(isValidHexBinary("0fb7")).toBe(true);
        expect(isValidHexBinary("0Fb7")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// base64Binary
// ---------------------------------------------------------------------------

describe("isValidBase64Binary", () => {
    it("accepts empty string (zero octets)", () => {
        expect(isValidBase64Binary("")).toBe(true);
    });

    it("accepts valid base64 with no padding", () => {
        // "hello" in base64
        expect(isValidBase64Binary("aGVsbG8")).toBe(false); // length not multiple of 4
        // "aGVsbG8=" is valid — 3 chars + padding
        // "aGVsbG8=" → wait, let me check: "hello" = "aGVsbG8=" (8 chars)
        // Actually "hello" in base64 is "aGVsbG8=" which is 8 chars = 2 groups of 4
        // "hell" = "aGVs" (4 chars, no padding)
        expect(isValidBase64Binary("aGVs")).toBe(true);
        // "aGVsbG8=" — 8 chars, 1 padding
        expect(isValidBase64Binary("aGVsbG8=")).toBe(true);
        // "aGVsbG8" — 7 chars, not multiple of 4
        expect(isValidBase64Binary("aGVsbG8")).toBe(false);
    });

    it("accepts valid base64 with padding", () => {
        // One octet: "Zg==" (2 chars + ==)
        expect(isValidBase64Binary("Zg==")).toBe(true);
        // Two octets: "Zm8=" (3 chars + =)
        expect(isValidBase64Binary("Zm8=")).toBe(true);
        // Three octets: "Zm9v" (4 chars, no padding)
        expect(isValidBase64Binary("Zm9v")).toBe(true);
    });

    it("rejects improperly padded base64", () => {
        // One = is not enough for 1-octet value
        expect(isValidBase64Binary("Zg=")).toBe(false);
        // Three = not allowed
        expect(isValidBase64Binary("Zg===")).toBe(false);
        // Four = also not allowed
        expect(isValidBase64Binary("Zg====")).toBe(false);
    });

    it("rejects invalid characters in base64", () => {
        expect(isValidBase64Binary("aGVs!g==")).toBe(false);
        expect(isValidBase64Binary("aGVs bG8=")).toBe(false);
    });

    it("rejects base64 with zero-unused-bits violation (two-octet case)", () => {
        // "Zg==" is valid: f(0x66) = Z, 0x67 = g, but g's low 4 bits = 0x7, not 0
        // Let's test with a known good: "Zg==" (Z=0x1A, g=0x20, value & 0xF = 0) ✓
        // Actually: Z=25, 25 & 0xF = 9 ≠ 0... hmm
        // Let me recalculate: "Zg==" = Z=25, g=32. 25*64+32 = 1632. 1632 >> 4 = 102. 102 = 0x66 = 'f'. OK that works.
        // 25 & 0xF = 9 ≠ 0? Wait, I need to check: for "==", the second char must have low 4 bits = 0.
        // 32 & 0xF = 0. Yes! g=32, 32 & 0xF = 0. So "Zg==" is valid.
        expect(isValidBase64Binary("Zg==")).toBe(true);

        // "Zx==": Z=25, x=49. 49 & 0xF = 1 ≠ 0. Invalid.
        expect(isValidBase64Binary("Zx==")).toBe(false);
    });

    it("rejects base64 with zero-unused-bits violation (three-octet case)", () => {
        // "Zm9v" valid (no padding)
        // "Zm9v" = Z(25), m(38), 9(61), v(47). 25*262144 + 38*4096 + 61*64 + 47 = 0x666f6f? Actually "foo" = 0x666f6f
        // "Zm9" = Z(25), m(38), 9(61). 61 & 0x3 = 1 ≠ 0. But "Zm9=" requires third char low 2 bits = 0. So "Zm9=" invalid.
        // "ZmA=": Z(25), m(38), A(0). 0 & 0x3 = 0. Valid.
        expect(isValidBase64Binary("ZmA=")).toBe(true);
        // "ZmB=": Z(25), m(38), B(1). 1 & 0x3 = 1 ≠ 0. Invalid.
        expect(isValidBase64Binary("ZmB=")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// anyURI
// ---------------------------------------------------------------------------

describe("isValidAnyURI", () => {
    it("accepts empty string", () => {
        expect(isValidAnyURI("")).toBe(true);
    });

    it("accepts a valid HTTP URL", () => {
        expect(isValidAnyURI("http://example.com/path")).toBe(true);
    });

    it("accepts a relative URI", () => {
        expect(isValidAnyURI("../relative/path")).toBe(true);
    });

    it("rejects control characters", () => {
        expect(isValidAnyURI("http://example.com/\npath")).toBe(false);
        expect(isValidAnyURI("http://example.com/\tpath")).toBe(false);
    });

    it("rejects internal space", () => {
        expect(isValidAnyURI("http://example.com/ path")).toBe(false);
    });

    it("accepts various URI schemes", () => {
        expect(isValidAnyURI("ftp://files.example.com")).toBe(true);
        expect(isValidAnyURI("mailto:user@example.com")).toBe(true);
        expect(isValidAnyURI("urn:isbn:0-486-27557-4")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// QName lexical
// ---------------------------------------------------------------------------

describe("isValidQNameLexical", () => {
    it("accepts a simple NCName (no prefix)", () => {
        expect(isValidQNameLexical("foo")).toBe(true);
        expect(isValidQNameLexical("_underscore")).toBe(true);
    });

    it("accepts a prefixed QName", () => {
        expect(isValidQNameLexical("ns:foo")).toBe(true);
        expect(isValidQNameLexical("xml:lang")).toBe(true);
    });

    it("rejects empty string", () => {
        expect(isValidQNameLexical("")).toBe(false);
    });

    it("rejects QName with only colon", () => {
        expect(isValidQNameLexical(":")).toBe(false);
    });

    it("rejects QName with empty prefix", () => {
        expect(isValidQNameLexical(":foo")).toBe(false);
    });

    it("rejects QName with empty local part", () => {
        expect(isValidQNameLexical("ns:")).toBe(false);
    });

    it("rejects QName with multiple colons", () => {
        expect(isValidQNameLexical("a:b:c")).toBe(false);
    });

    it("rejects prefix starting with a digit", () => {
        expect(isValidQNameLexical("1ns:foo")).toBe(false);
    });

    it("rejects local part starting with a digit", () => {
        expect(isValidQNameLexical("ns:1foo")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkRemainingFamilyLexicalSpace — dispatch integration
// ---------------------------------------------------------------------------

describe("checkRemainingFamilyLexicalSpace", () => {
    it("validates boolean via built-in type reference", () => {
        const boolType = builtin("boolean");
        expect(checkRemainingFamilyLexicalSpace("true", boolType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("false", boolType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("1", boolType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("0", boolType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("yes", boolType)).not.toBeNull();
    });

    it("validates boolean via derived type", () => {
        const boolType = builtin("boolean");
        const derived = derivedSt("MyBool", boolType);
        expect(checkRemainingFamilyLexicalSpace("true", derived)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("nope", derived)).not.toBeNull();
    });

    it("validates hexBinary", () => {
        const hexType = builtin("hexBinary");
        expect(checkRemainingFamilyLexicalSpace("0FB7", hexType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("0FB", hexType)).not.toBeNull();
        expect(checkRemainingFamilyLexicalSpace("0F G", hexType)).not.toBeNull();
    });

    it("validates base64Binary", () => {
        const b64Type = builtin("base64Binary");
        expect(checkRemainingFamilyLexicalSpace("Zm9v", b64Type)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("Zm9", b64Type)).not.toBeNull();
        expect(checkRemainingFamilyLexicalSpace("Zm9v!", b64Type)).not.toBeNull();
    });

    it("validates anyURI", () => {
        const uriType = builtin("anyURI");
        expect(checkRemainingFamilyLexicalSpace("http://example.com", uriType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("http://example.com/ path", uriType)).not.toBeNull();
        expect(checkRemainingFamilyLexicalSpace("", uriType)).toBeNull();
    });

    it("validates QName lexical form", () => {
        const qnType = builtin("QName");
        expect(checkRemainingFamilyLexicalSpace("foo", qnType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("ns:foo", qnType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("a:b:c", qnType)).not.toBeNull();
        expect(checkRemainingFamilyLexicalSpace("", qnType)).not.toBeNull();
    });

    it("validates NOTATION (same lexical form as QName)", () => {
        const notType = builtin("NOTATION");
        expect(checkRemainingFamilyLexicalSpace("foo", notType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("ns:foo", notType)).toBeNull();
        expect(checkRemainingFamilyLexicalSpace("a:b:c", notType)).not.toBeNull();
    });

    it("returns null for non-remaining-family types", () => {
        const strType = builtin("string");
        expect(checkRemainingFamilyLexicalSpace("anything", strType)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Octet length helpers
// ---------------------------------------------------------------------------

describe("hexBinaryOctetLength", () => {
    it("counts octets for even-length hex strings", () => {
        expect(hexBinaryOctetLength("")).toBe(0);
        expect(hexBinaryOctetLength("0F")).toBe(1);
        expect(hexBinaryOctetLength("0FB7")).toBe(2);
        expect(hexBinaryOctetLength("deadbeef")).toBe(4);
    });
});

describe("base64BinaryOctetLength", () => {
    it("counts octets for unpadded base64 (group of 4)", () => {
        // "Zm9v" = "foo" = 3 octets
        expect(base64BinaryOctetLength("Zm9v")).toBe(3);
    });

    it("counts octets for base64 with one padding", () => {
        // "Zm8=" = "fo" = 2 octets
        expect(base64BinaryOctetLength("Zm8=")).toBe(2);
    });

    it("counts octets for base64 with two padding", () => {
        // "Zg==" = "f" = 1 octet
        expect(base64BinaryOctetLength("Zg==")).toBe(1);
    });

    it("counts octets for empty string", () => {
        expect(base64BinaryOctetLength("")).toBe(0);
    });
});

describe("binaryOctetLength", () => {
    it("returns octet count for hexBinary type", () => {
        const hx = builtin("hexBinary");
        expect(binaryOctetLength("deadbeef", hx)).toBe(4);
    });

    it("returns octet count for base64Binary type", () => {
        const b64 = builtin("base64Binary");
        expect(binaryOctetLength("Zm9v", b64)).toBe(3);
    });

    it("returns null for non-binary types", () => {
        const str = builtin("string");
        expect(binaryOctetLength("anything", str)).toBeNull();
    });

    it("walks the base chain for derived types", () => {
        const hx = builtin("hexBinary");
        const derived = derivedSt("MyHex", hx);
        expect(binaryOctetLength("0F1A", derived)).toBe(2);
    });
});