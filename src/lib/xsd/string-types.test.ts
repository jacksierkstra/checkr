/**
 * Tests for string-family lexical-space validators (CHK-011).
 */

import {
    isValidLanguage,
    isValidName,
    isValidNCName,
    isValidNMTOKEN,
    checkStringFamilyLexicalSpace,
} from "@lib/xsd/string-types";
import { SimpleTypeDefinition } from "@lib/types/component-graph";

// ---------------------------------------------------------------------------
// Helpers to create minimal built-in-like SimpleTypeDefinitions for testing
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
        whiteSpace: "preserve",
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

// ---------------------------------------------------------------------------
// language
// ---------------------------------------------------------------------------

describe("isValidLanguage", () => {

    it("accepts simple ISO language codes (en, fr, de)", () => {
        expect(isValidLanguage("en")).toBe(true);
        expect(isValidLanguage("fr")).toBe(true);
        expect(isValidLanguage("de")).toBe(true);
    });

    it("accepts region subtags (en-US, zh-CN)", () => {
        expect(isValidLanguage("en-US")).toBe(true);
        expect(isValidLanguage("zh-CN")).toBe(true);
    });

    it("accepts extended language subtags (sgn-US)", () => {
        expect(isValidLanguage("sgn-US")).toBe(true);
    });

    it("rejects empty string", () => {
        expect(isValidLanguage("")).toBe(false);
    });

    it("rejects strings with spaces", () => {
        expect(isValidLanguage("en US")).toBe(false);
    });

    it("rejects strings with invalid characters like underscores", () => {
        expect(isValidLanguage("en_US")).toBe(false);
    });

    it("accepts longer primary tags up to 8 letters", () => {
        expect(isValidLanguage("abcdefgh")).toBe(true);
    });

    it("rejects primary tags longer than 8 letters", () => {
        expect(isValidLanguage("abcdefghi")).toBe(false);
    });

    it("accepts sub-tags with digits (ISO 639 + country code variant)", () => {
        expect(isValidLanguage("de-DE")).toBe(true);
        expect(isValidLanguage("en-GB")).toBe(true);
    });

    it("accepts digit-only subtags (permissive XSD regex: [a-zA-Z0-9] in subtags)", () => {
        // The XSD spec pattern only restricts the primary to letters;
        // subsequent subtags can be alphanumeric.
        expect(isValidLanguage("en-1234")).toBe(true);
    });

});

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

describe("isValidName", () => {

    it("accepts simple element names (foo, bar, _name, xmlTag)", () => {
        expect(isValidName("foo")).toBe(true);
        expect(isValidName("bar")).toBe(true);
        expect(isValidName("_name")).toBe(true);
        expect(isValidName("xmlTag")).toBe(true);
    });

    it("accepts names with colons (prefixed names)", () => {
        expect(isValidName("xs:string")).toBe(true);
        expect(isValidName("ns:element")).toBe(true);
    });

    it("accepts names with digits and dots", () => {
        expect(isValidName("item123")).toBe(true);
        expect(isValidName("item.1")).toBe(true);
    });

    it("accepts names starting with a colon", () => {
        // Per XML spec, ':' is a valid NameStartChar
        expect(isValidName(":test")).toBe(true);
    });

    it("rejects empty string", () => {
        expect(isValidName("")).toBe(false);
    });

    it("rejects names starting with a digit", () => {
        expect(isValidName("1foo")).toBe(false);
    });

    it("rejects names starting with a hyphen", () => {
        expect(isValidName("-foo")).toBe(false);
    });

    it("rejects names starting with a dot", () => {
        expect(isValidName(".foo")).toBe(false);
    });

    it("rejects names containing spaces", () => {
        expect(isValidName("foo bar")).toBe(false);
    });

    it("rejects names with invalid characters like @", () => {
        expect(isValidName("foo@bar")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// NCName
// ---------------------------------------------------------------------------

describe("isValidNCName", () => {

    it("accepts simple NCName (foo, _name, xmlTag)", () => {
        expect(isValidNCName("foo")).toBe(true);
        expect(isValidNCName("_name")).toBe(true);
        expect(isValidNCName("xmlTag")).toBe(true);
    });

    it("rejects names with colons", () => {
        expect(isValidNCName("xs:string")).toBe(false);
        expect(isValidNCName("ns:element")).toBe(false);
    });

    it("accepts names with digits", () => {
        expect(isValidNCName("item123")).toBe(true);
    });

    it("rejects empty string", () => {
        expect(isValidNCName("")).toBe(false);
    });

    it("rejects names starting with a digit", () => {
        expect(isValidNCName("1foo")).toBe(false);
    });

    it("rejects names starting with a dot", () => {
        expect(isValidNCName(".foo")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// NMTOKEN
// ---------------------------------------------------------------------------

describe("isValidNMTOKEN", () => {

    it("accepts simple NMTOKEN (foo, 123, _underscore)", () => {
        expect(isValidNMTOKEN("foo")).toBe(true);
        expect(isValidNMTOKEN("123")).toBe(true);
        expect(isValidNMTOKEN("_underscore")).toBe(true);
    });

    it("accepts NMTOKEN starting with digits or hyphens", () => {
        expect(isValidNMTOKEN("123")).toBe(true);
        expect(isValidNMTOKEN("-hyphen")).toBe(true);
        expect(isValidNMTOKEN(".dot")).toBe(true);
    });

    it("accepts NMTOKEN with colons", () => {
        expect(isValidNMTOKEN("xs:string")).toBe(true);
    });

    it("rejects empty string", () => {
        expect(isValidNMTOKEN("")).toBe(false);
    });

    it("rejects strings with spaces", () => {
        expect(isValidNMTOKEN("foo bar")).toBe(false);
    });

    it("rejects strings with invalid characters like @", () => {
        expect(isValidNMTOKEN("foo@bar")).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// checkStringFamilyLexicalSpace — walks the type hierarchy
// ---------------------------------------------------------------------------

describe("checkStringFamilyLexicalSpace", () => {

    it("returns null for xs:string (no lexical constraint)", () => {
        const t = builtin("string");
        expect(checkStringFamilyLexicalSpace("anything goes 123!@#", t)).toBeNull();
    });

    it("returns null for xs:string-derived types (no strict built-in ancestry)", () => {
        const base = builtin("string");
        const t = derivedSt("MyType", base);
        // Types derived from string have no lexical-space check beyond string
        expect(checkStringFamilyLexicalSpace("anything", t)).toBeNull();
    });

    it("validates language for a type derived from xs:language", () => {
        const base = builtin("language");
        const t = derivedSt("MyLang", base);
        expect(checkStringFamilyLexicalSpace("en", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("en-US", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("123", t)).not.toBeNull();
    });

    it("validates Name for a type derived from xs:Name", () => {
        const base = builtin("Name");
        const t = derivedSt("MyName", base);
        expect(checkStringFamilyLexicalSpace("validName", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("1invalid", t)).not.toBeNull();
    });

    it("validates NCName for a type derived from xs:NCName", () => {
        const base = builtin("NCName");
        const t = derivedSt("MyNCName", base);
        expect(checkStringFamilyLexicalSpace("validName", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("ns:invalid", t)).not.toBeNull();
    });

    it("validates NMTOKEN for a type derived from xs:NMTOKEN", () => {
        const base = builtin("NMTOKEN");
        const t = derivedSt("MyTok", base);
        expect(checkStringFamilyLexicalSpace("token123", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("", t)).not.toBeNull();
    });

    it("validates NMTOKENS as space-separated list of NMTOKEN", () => {
        const base = builtin("NMTOKENS");
        const t = derivedSt("MyToks", base);
        expect(checkStringFamilyLexicalSpace("token1 token2 token3", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("token1 invalid@token token3", t)).not.toBeNull();
    });

    it("validates ID as NCName", () => {
        const base = builtin("ID");
        const t = derivedSt("MyId", base);
        expect(checkStringFamilyLexicalSpace("validId", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("1invalid", t)).not.toBeNull();
    });

    it("validates IDREF as NCName", () => {
        const base = builtin("IDREF");
        const t = derivedSt("MyRef", base);
        expect(checkStringFamilyLexicalSpace("validId", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("ns:invalid", t)).not.toBeNull();
    });

    it("validates IDREFS as space-separated list of NCName", () => {
        const base = builtin("IDREFS");
        const t = derivedSt("MyRefs", base);
        expect(checkStringFamilyLexicalSpace("id1 id2 id3", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("id1 ns:bad id3", t)).not.toBeNull();
    });

    it("validates ENTITY as NCName", () => {
        const base = builtin("ENTITY");
        const t = derivedSt("MyEnt", base);
        expect(checkStringFamilyLexicalSpace("validEntity", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("1invalid", t)).not.toBeNull();
    });

    it("validates ENTITIES as space-separated list of NCName", () => {
        const base = builtin("ENTITIES");
        const t = derivedSt("MyEnts", base);
        expect(checkStringFamilyLexicalSpace("e1 e2 e3", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("e1 ns:bad e3", t)).not.toBeNull();
    });

    it("walks the base chain to find the built-in ancestor", () => {
        const lang = builtin("language");
        const mid = derivedSt("MidLang", lang);
        const t = derivedSt("DeepLang", mid);
        expect(checkStringFamilyLexicalSpace("en", t)).toBeNull();
        expect(checkStringFamilyLexicalSpace("invalid-", t)).not.toBeNull();
    });

    it("returns null for types derived from token (no own lexical rule)", () => {
        const base = builtin("token");
        const t = derivedSt("MyToken", base);
        // token has no additional lexical constraint beyond whitespace normalization
        expect(checkStringFamilyLexicalSpace("no-constraint", t)).toBeNull();
    });

    it("returns null for types derived from normalizedString (no own lexical rule)", () => {
        const base = builtin("normalizedString");
        const t = derivedSt("MyNorm", base);
        expect(checkStringFamilyLexicalSpace("no tabs or newlines here", t)).toBeNull();
    });

    it("returns null for types no base chain (primitive with no known string family)", () => {
        const t = builtin("integer");
        expect(checkStringFamilyLexicalSpace("123", t)).toBeNull();
    });

});