/**
 * Lexical-space validators for XSD 1.0 string-family built-in types (CHK-011).
 *
 * Each string-family built-in type defines a lexical space that restricts
 * the characters (after whitespace normalisation) that can appear in a value.
 * This module provides per-type checkers and a function that walks the type
 * hierarchy to find the string-family ancestor and apply the correct check.
 *
 * See XSD 1.0 Part 2 §3.2 string-family definitions and §4.3.6 whiteSpace.
 */

import { SimpleTypeDefinition } from "@lib/types/component-graph";
import { NAMESPACE_XSD } from "@lib/types/namespaces";

// ---------------------------------------------------------------------------
// XML 1.0 (Fifth Edition) character classes for Name / Nmtoken productions
// ---------------------------------------------------------------------------

// NameStartChar ::= ":" | [A-Z] | "_" | [a-z] | [#xC0-#xD6] | [#xD8-#xF6]
//   | [#xF8-#x2FF] | [#x370-#x37D] | [#x37F-#x1FFF] | [#x200C-#x200D]
//   | [#x2070-#x218F] | [#x2C00-#x2FEF] | [#x3001-#xD7FF] | [#xF900-#xFDCF]
//   | [#xFDF0-#xFFFD] | [#x10000-#xEFFFF]

function isNameStartChar(code: number): boolean {
    if (code === 0x3A) return true; // ':'
    if (code >= 0x41 && code <= 0x5A) return true; // A-Z
    if (code === 0x5F) return true; // '_'
    if (code >= 0x61 && code <= 0x7A) return true; // a-z
    if (code >= 0xC0 && code <= 0xD6) return true;
    if (code >= 0xD8 && code <= 0xF6) return true;
    if (code >= 0xF8 && code <= 0x2FF) return true;
    if (code >= 0x370 && code <= 0x37D) return true;
    if (code >= 0x37F && code <= 0x1FFF) return true;
    if (code >= 0x200C && code <= 0x200D) return true;
    if (code >= 0x2070 && code <= 0x218F) return true;
    if (code >= 0x2C00 && code <= 0x2FEF) return true;
    if (code >= 0x3001 && code <= 0xD7FF) return true;
    if (code >= 0xF900 && code <= 0xFDCF) return true;
    if (code >= 0xFDF0 && code <= 0xFFFD) return true;
    if (code >= 0x10000 && code <= 0xEFFFF) return true;
    return false;
}

// NameChar ::= NameStartChar | "-" | "." | [0-9] | #xB7
//   | [#x0300-#x036F] | [#x203F-#x2040]

function isNameChar(code: number): boolean {
    if (isNameStartChar(code)) return true;
    if (code === 0x2D) return true; // '-'
    if (code === 0x2E) return true; // '.'
    if (code >= 0x30 && code <= 0x39) return true; // 0-9
    if (code === 0xB7) return true;
    if (code >= 0x300 && code <= 0x36F) return true;
    if (code >= 0x203F && code <= 0x2040) return true;
    return false;
}

// ---------------------------------------------------------------------------
// Individual lexical-space validators
// ---------------------------------------------------------------------------

/**
 * Check whether a value conforms to the XSD `xs:language` lexical space.
 * Pattern: [a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*
 */
export function isValidLanguage(value: string): boolean {
    if (value.length === 0) return false;
    return /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/.test(value);
}

/**
 * Check whether a value conforms to the XML 1.0 Name production.
 * A Name starts with NameStartChar and continues with NameChar*.
 */
export function isValidName(value: string): boolean {
    if (value.length === 0) return false;
    const chars = Array.from(value);
    if (!isNameStartChar(chars[0]!.codePointAt(0)!)) return false;
    for (let i = 1; i < chars.length; i++) {
        if (!isNameChar(chars[i]!.codePointAt(0)!)) return false;
    }
    return true;
}

/**
 * Check whether a value conforms to the XML 1.0 NCName production.
 * An NCName is a Name that does not contain colons.
 */
export function isValidNCName(value: string): boolean {
    if (value.length === 0) return false;
    if (value.indexOf(":") !== -1) return false;
    return isValidName(value);
}

/**
 * Check whether a value conforms to the XML 1.0 Nmtoken production.
 * An NMTOKEN is one or more NameChar characters.
 */
export function isValidNMTOKEN(value: string): boolean {
    if (value.length === 0) return false;
    const chars = Array.from(value);
    for (const ch of chars) {
        if (!isNameChar(ch.codePointAt(0)!)) return false;
    }
    return true;
}

/**
 * Check whether a value is a space-separated list of items where each
 * individual item passes the given validator.
 */
function isValidList(value: string, itemValidator: (item: string) => boolean): boolean {
    if (value.length === 0) return false;
    const items = value.split(/\s+/);
    return items.length > 0 && items.every(itemValidator);
}

// ---------------------------------------------------------------------------
// String-family built-in local names (xsd namespace)
// ---------------------------------------------------------------------------

const STRING_FAMILY_CHECKERS: Record<string, (value: string) => string | null> = {
    // Types with their own lexical-space rule
    language: (v) => isValidLanguage(v) ? null : "not a valid xs:language value",
    Name: (v) => isValidName(v) ? null : "not a valid xs:Name value",
    NCName: (v) => isValidNCName(v) ? null : "not a valid xs:NCName value",
    NMTOKEN: (v) => isValidNMTOKEN(v) ? null : "not a valid xs:NMTOKEN value",
    ID: (v) => isValidNCName(v) ? null : "not a valid xs:ID value",
    IDREF: (v) => isValidNCName(v) ? null : "not a valid xs:IDREF value",
    ENTITY: (v) => isValidNCName(v) ? null : "not a valid xs:ENTITY value",
    // List types — split on whitespace and check each item
    NMTOKENS: (v) => isValidList(v, isValidNMTOKEN) ? null : "not a valid xs:NMTOKENS value",
    IDREFS: (v) => isValidList(v, isValidNCName) ? null : "not a valid xs:IDREFS value",
    ENTITIES: (v) => isValidList(v, isValidNCName) ? null : "not a valid xs:ENTITIES value",
};

/** Built-in types in the string family whose base types have no own lexical
 * rule beyond that base's restriction — they inherit the whitespace
 * normalization only (string → normalizedString → token).
 * These are NOT in STRING_FAMILY_CHECKERS because they have no lexical rule
 * that would fail after whitespace normalization.
 *
 * normalizedString: no #x9/#xA/#xD in the lexical space, but "replace"
 *   normalization removes them before validation, so no check needed.
 * token: no leading/trailing/internal consecutive #x20, but "collapse"
 *   normalization handles this before validation, so no check needed.
 */

const STRING_FAMILY_NAMES = new Set([
    "string",
    "normalizedString",
    "token",
    "language",
    "Name",
    "NCName",
    "NMTOKEN",
    "NMTOKENS",
    "ID",
    "IDREF",
    "IDREFS",
    "ENTITY",
    "ENTITIES",
]);

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Walk the type's base chain to find a string-family built-in ancestor and
 * apply its lexical-space check against the (already-normalized) value.
 *
 * Returns an error message string if the value violates the lexical space,
 * or `null` if the value is valid or the type is not in the string family.
 *
 * The value MUST be already whitespace-normalised per the type's whiteSpace
 * before calling this function, since the lexical spaces of
 * normalizedString/token are defined in terms of the normalised value.
 */
export function checkStringFamilyLexicalSpace(
    normalized: string,
    type: SimpleTypeDefinition,
): string | null {
    // Walk the base chain to find the most specific string-family built-in
    // ancestor (the first one encountered walking up from the type itself).
    // E.g. a restriction of xs:ID stops at ID, not at its NCName base, so the
    // ID-specific list/lexical rules apply.
    let current: SimpleTypeDefinition | null = type;
    let builtinName: string | null = null;

    while (current) {
        const name = current.name;
        if (name && name.namespaceURI === NAMESPACE_XSD) {
            const ln = name.localName;
            if (STRING_FAMILY_NAMES.has(ln)) {
                builtinName = ln;
                break;
            }
        }
        current = current.baseType;
    }

    if (!builtinName) return null; // Not a string-family type

    const checker = STRING_FAMILY_CHECKERS[builtinName];
    if (!checker) return null; // Base type (string, normalizedString, token) — no check

    return checker(normalized);
}