/**
 * Lexical-space validators and helpers for the remaining built-in types
 * not covered by string, numeric, or date/time families (CHK-014).
 *
 * Covers:
 *   - boolean
 *   - hexBinary, base64Binary
 *   - anyURI
 *   - QName, NOTATION (lexical QName form; namespace resolution deferred to CHK-017)
 *
 * See XSD 1.0 Part 2 §3.2.14 (boolean), §3.2.15 (hexBinary), §3.2.16 (base64Binary),
 * §3.2.17 (anyURI), §3.2.18 (QName), §3.2.19 (NOTATION).
 */

import { SimpleTypeDefinition } from "@lib/types/component-graph";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
import { isValidNCName } from "@lib/xsd/string-types";

// ---------------------------------------------------------------------------
// boolean  (XSD 1.0 Part 2 §3.2.14)
// ---------------------------------------------------------------------------

const BOOLEAN_VALUES = new Set(["true", "false", "1", "0"]);

/**
 * Check whether a (whitespace-collapsed) value conforms to the
 * XSD `xs:boolean` lexical space.
 *
 * Valid values: "true", "false", "1", "0".
 * The caller MUST have already applied whitespace normalization (collapse)
 * per the type's whiteSpace facet; `normalizeWhiteSpace` is called before
 * this function in the validation pipeline.
 */
export function isValidBoolean(value: string): boolean {
    return BOOLEAN_VALUES.has(value);
}

// ---------------------------------------------------------------------------
// hexBinary  (XSD 1.0 Part 2 §3.2.15)
// ---------------------------------------------------------------------------

const HEX_RE = /^([0-9a-fA-F]{2})*$/;

/**
 * Check whether a (whitespace-collapsed) value conforms to the
 * XSD `xs:hexBinary` lexical space.
 *
 * The lexical space is the set of even-length strings of hexadecimal
 * digits, possibly empty. Internal whitespace is not allowed in XSD 1.0
 * hexBinary lexical space (the whiteSpace=collapse facet normalises
 * leading/trailing whitespace, but interior single spaces survive and
 * make the value invalid).
 */
export function isValidHexBinary(value: string): boolean {
    return HEX_RE.test(value);
}

/**
 * Return the number of octets represented by a valid hexBinary value.
 * The value MUST have already passed `isValidHexBinary`.
 */
export function hexBinaryOctetLength(value: string): number {
    return value.length / 2;
}

// ---------------------------------------------------------------------------
// base64Binary  (XSD 1.0 Part 2 §3.2.16)
// ---------------------------------------------------------------------------

// Base64 alphabet: A-Z, a-z, 0-9, +, /
// RFC 2045 §6.8: the encoding output uses fixed 4-character groups, padded
// with '=' to a multiple of 4 characters. Zero unused bits are enforced:
//
//   Final group of 2 chars + "==": second char must have low 4 bits = 0
//     → second char ∈ {A, Q, g, w}  (values 0, 16, 32, 48)
//   Final group of 3 chars + "=":  third char must have low 2 bits = 0
//     → third char ∈ {A, E, I, M, Q, U, Y, c, g, k, o, s, w, 0, 4, 8}
//                          (values 0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40,
//                                    44, 48, 52, 56, 60)

const BASE64_RE = new RegExp(
    "^" +
    "([A-Za-z0-9+/]{4})*" +
    "(" +
        "[A-Za-z0-9+/][AQgw]==" +
        "|" +
        "[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=" +
    ")?$",
);

/**
 * Check whether a (whitespace-collapsed) value conforms to the
 * XSD `xs:base64Binary` lexical space.
 *
 * The lexical space is the base64 encoding of an octet sequence as defined
 * in RFC 2045, padded to a multiple of 4 characters. Zero unused bits in
 * the final group are enforced. Internal whitespace is not allowed in the
 * XSD 1.0 lexical space (whitespace is normalised first by collapse, but
 * a single interior space survives and makes the value invalid).
 */
export function isValidBase64Binary(value: string): boolean {
    return BASE64_RE.test(value);
}

/**
 * Return the number of octets represented by a valid base64Binary value.
 * The value MUST have already passed `isValidBase64Binary`.
 */
export function base64BinaryOctetLength(value: string): number {
    // Groups of 4 base64 chars encode 3 octets.
    // Padding '=' characters reduce the octet count:
    //   no padding:  len/4 * 3
    //   "==":       (len/4) * 3 - 2  (len includes the two '=' signs)
    //   "=":        (len/4) * 3 - 1
    const groups = value.length / 4;
    let octets = groups * 3;
    if (value.endsWith("==")) {
        octets -= 2;
    } else if (value.endsWith("=")) {
        octets -= 1;
    }
    return octets;
}

/**
 * Walk the type's base chain to find a binary-family ancestor
 * (hexBinary or base64Binary) and return the octet count of the value,
 * or `null` if the type is not in the binary family.
 */
export function binaryOctetLength(
    normalized: string,
    type: SimpleTypeDefinition,
): number | null {
    let current: SimpleTypeDefinition | null = type;
    let builtinName: string | null = null;

    while (current) {
        const name = current.name;
        if (name && name.namespaceURI === NAMESPACE_XSD) {
            const ln = name.localName;
            if (ln === "hexBinary" || ln === "base64Binary") {
                builtinName = ln;
                break;
            }
        }
        current = current.baseType;
    }

    if (!builtinName) return null;

    if (builtinName === "hexBinary") {
        return hexBinaryOctetLength(normalized);
    }
    // base64Binary
    return base64BinaryOctetLength(normalized);
}

// ---------------------------------------------------------------------------
// anyURI  (XSD 1.0 Part 2 §3.2.17)
// ---------------------------------------------------------------------------

/**
 * Check whether a (whitespace-collapsed) value conforms to the
 * XSD `xs:anyURI` lexical space.
 *
 * XSD 1.0 defines the value space as the set of valid URI references
 * per RFC 2396 (as amended by RFC 2732). In practice, every major
 * validator (Xerces, Saxon, .NET) accepts any string after whitespace
 * normalisation, because full RFC 3986 validation is impractical at
 * XML Schema time. This implementation follows that pragmatic approach:
 * after whitespace collapse, the only characters rejected are those
 * that can never appear in a valid URI reference: control characters
 * (code points < 0x20, and 0x7F) and internal whitespace (which,
 * after collapse, would be a single space).
 *
 * The empty string is accepted as a valid relative URI reference.
 */
export function isValidAnyURI(value: string): boolean {
    if (value.length === 0) return true;
    // Reject control characters and whitespace
    for (const ch of value) {
        const code = ch.codePointAt(0)!;
        if (code < 0x20 || code === 0x7F) return false;
        if (code === 0x20) return false; // space — never valid inside a URI
    }
    return true;
}

// ---------------------------------------------------------------------------
// QName  (XSD 1.0 Part 2 §3.2.18)
// ---------------------------------------------------------------------------

/**
 * Check whether a (whitespace-collapsed) value conforms to the
 * XSD `xs:QName` lexical space.
 *
 * A QName is either an NCName (local-only) or two NCNames separated by
 * a colon (prefix:local). The full resolution to {namespaceURI}localName
 * requires an in-scope namespace context (CHK-017); this function only
 * checks the lexical form.
 *
 * NOTATION (§3.2.19) shares the same lexical space as QName.
 */
export function isValidQNameLexical(value: string): boolean {
    if (value.length === 0) return false;
    const colon = value.indexOf(":");
    if (colon === -1) {
        return isValidNCName(value);
    }
    // At most one colon
    if (value.indexOf(":", colon + 1) !== -1) return false;
    const prefix = value.slice(0, colon);
    const local = value.slice(colon + 1);
    if (prefix.length === 0 || local.length === 0) return false;
    return isValidNCName(prefix) && isValidNCName(local);
}

// ---------------------------------------------------------------------------
// Remaining-family detection
// ---------------------------------------------------------------------------

const REMAINING_FAMILY_NAMES = new Set([
    "boolean",
    "hexBinary",
    "base64Binary",
    "anyURI",
    "QName",
    "NOTATION",
]);

// ---------------------------------------------------------------------------
// Main entry point — lexical-space check
// ---------------------------------------------------------------------------

/**
 * Walk the type's base chain to find a remaining-family built-in ancestor
 * and apply its lexical-space check against the (already-normalised) value.
 *
 * Returns an error message string if the value violates the lexical space,
 * or `null` if the value is valid or the type is not in the remaining family.
 */
export function checkRemainingFamilyLexicalSpace(
    normalized: string,
    type: SimpleTypeDefinition,
): string | null {
    let current: SimpleTypeDefinition | null = type;
    let builtinName: string | null = null;

    while (current) {
        const name = current.name;
        if (name && name.namespaceURI === NAMESPACE_XSD) {
            const ln = name.localName;
            if (REMAINING_FAMILY_NAMES.has(ln)) {
                builtinName = ln;
                break;
            }
        }
        current = current.baseType;
    }

    if (!builtinName) return null; // Not a remaining-family type

    switch (builtinName) {
        case "boolean":
            if (!isValidBoolean(normalized)) return "not a valid xs:boolean value";
            return null;
        case "hexBinary":
            if (!isValidHexBinary(normalized)) return "not a valid xs:hexBinary value";
            return null;
        case "base64Binary":
            if (!isValidBase64Binary(normalized)) return "not a valid xs:base64Binary value";
            return null;
        case "anyURI":
            if (!isValidAnyURI(normalized)) return "not a valid xs:anyURI value";
            return null;
        case "QName":
            if (!isValidQNameLexical(normalized)) return "not a valid xs:QName value";
            return null;
        case "NOTATION":
            if (!isValidQNameLexical(normalized)) return "not a valid xs:NOTATION value";
            return null;
        default:
            return null;
    }
}