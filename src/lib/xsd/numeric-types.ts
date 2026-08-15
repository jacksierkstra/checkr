/**
 * Lexical-space validators, value-space parsing, and bound-facet evaluation
 * for XSD 1.0 numeric-family built-in types (CHK-012).
 *
 * Supports:
 *   - decimal (arbitrary precision, string-based)
 *   - integer and the full derived integer hierarchy
 *   - float and double (IEEE 754 binary32/binary64, incl. INF/-INF/NaN)
 *
 * Each built-in type defines a lexical space and a value space.  This module
 * provides per-type checkers, a function that walks the type hierarchy to
 * find the numeric-family ancestor, and helpers used by the facet framework
 * to evaluate bound facets (minInclusive etc.) and scale facets (totalDigits,
 * fractionDigits).
 *
 * See XSD 1.0 Part 2 §3.2.3 (decimal), §3.2.4 (float), §3.2.5 (double),
 * §3.3 (integer family), and §4.3.12–4.3.13 (totalDigits/fractionDigits).
 */

import { SimpleTypeDefinition } from "@lib/types/component-graph";
import { NAMESPACE_XSD } from "@lib/types/namespaces";

// ---------------------------------------------------------------------------
// Canonical decimal representation (arbitrary precision)
// ---------------------------------------------------------------------------

/**
 * Canonical form of an XSD decimal value.
 *
 * The value is `sign × intDigits · fracDigits` (no leading zeros in
 * intDigits unless it is exactly "0"; no trailing zeros in fracDigits).
 * Both strings are non-empty digit sequences; fracDigits may be "".
 *
 * For zero the sign is always +1.
 */
export interface CanonicalDecimal {
    readonly sign: 1 | -1;
    readonly intDigits: string;
    readonly fracDigits: string;
}

// ---------------------------------------------------------------------------
// Lexical-space validators
// ---------------------------------------------------------------------------

const DECIMAL_RE = /^[+-]?((\d+(\.\d*)?)|(\.\d+))$/;
const INTEGER_RE = /^[+-]?\d+$/;
const FLOAT_RE = /^[+-]?((\d+(\.\d*)?)|(\.\d+))([eE][+-]?\d+)?$/;
const SPECIAL_RE = /^(INF|-INF|NaN)$/;

/**
 * Check whether a (whitespace-normalised) value conforms to the
 * XSD `xs:decimal` lexical space.
 *
 *   decimalRep ::= ('+'|'-')? (([0-9]+ ('.' [0-9]*)?) | ('.' [0-9]+))
 */
export function isValidDecimalLexical(value: string): boolean {
    return DECIMAL_RE.test(value);
}

/**
 * Check whether a (whitespace-normalised) value conforms to the
 * XSD `xs:integer` lexical space.
 *
 *   integerRep ::= ('+'|'-')? [0-9]+
 *
 * Note: the integer family disallows the decimal point (unlike fractionDigits=0
 * restrictions of decimal, which do allow it).
 */
export function isValidIntegerLexical(value: string): boolean {
    return INTEGER_RE.test(value);
}

/**
 * Check whether a (whitespace-normalised) value conforms to the
 * XSD `xs:float` / `xs:double` lexical space.
 *
 *   floatRep ::= ('.' [0-9]+) | ([0-9]+ ('.' [0-9]*)?) ([Ee] ('+'|'-')? [0-9]+)?
 *   specialRep ::= 'INF' | '-INF' | 'NaN'
 *   float ::= floatRep | specialRep
 *
 * Practical note: the spec grammar for floatRep does not include a sign on the
 * mantissa, but the surrounding prose says the mantissa "must be a decimal
 * number" (which allows a sign).  Every major implementation (Xerces, MSV,
 * Saxon, .NET, libxml2) accepts a leading sign, so we do too.
 */
export function isValidFloatLexical(value: string): boolean {
    return FLOAT_RE.test(value) || SPECIAL_RE.test(value);
}

// ---------------------------------------------------------------------------
// Value parsing — decimal
// ---------------------------------------------------------------------------

/**
 * Parse a canonical decimal lexical form into its canonical representation.
 * Returns `null` if the value is not a valid decimal lexical form.
 */
export function parseDecimal(value: string): CanonicalDecimal | null {
    if (!isValidDecimalLexical(value)) return null;

    const sign: 1 | -1 = value.startsWith("-") ? -1 : 1;
    let body = value;
    if (body.startsWith("+") || body.startsWith("-")) body = body.slice(1);

    const dot = body.indexOf(".");
    let intDigits = dot === -1 ? body : body.slice(0, dot);
    let fracDigits = dot === -1 ? "" : body.slice(dot + 1);

    // Strip leading zeros from the integer part
    intDigits = intDigits.replace(/^0+/, "");
    if (intDigits === "") intDigits = "0";

    // Strip trailing zeros from the fractional part
    fracDigits = fracDigits.replace(/0+$/, "");

    // Normalise zero to sign +1
    const isZero = intDigits === "0" && fracDigits === "";
    return { sign: isZero ? 1 : sign, intDigits, fracDigits };
}

// ---------------------------------------------------------------------------
// Value parsing — float / double
// ---------------------------------------------------------------------------

/**
 * Parse a lexical float/double value into a JS number.
 *
 * For "NaN", "INF", "-INF" the result is NaN, Infinity, -Infinity respectively.
 * For regular values, `Number(value)` is used (IEEE 754 binary64 rounding).
 * Callers processing `xs:float` should apply `Math.fround()` to the result.
 *
 * Returns `null` when the lexical form is invalid.
 */
export function parseFloatingPoint(value: string): number | null {
    if (!isValidFloatLexical(value)) return null;
    switch (value) {
        case "INF":  return Infinity;
        case "-INF": return -Infinity;
        case "NaN":  return NaN;
        default:     return Number(value);
    }
}

// ---------------------------------------------------------------------------
// Decimal comparison
// ---------------------------------------------------------------------------

/**
 * Compare two positive canonical decimal values (ignoring sign).
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function comparePositiveMagnitude(a: CanonicalDecimal, b: CanonicalDecimal): -1 | 0 | 1 {
    // Normalise integer parts to the same width
    const maxInt = Math.max(a.intDigits.length, b.intDigits.length);
    const aInt = a.intDigits.padStart(maxInt, "0");
    const bInt = b.intDigits.padStart(maxInt, "0");
    if (aInt !== bInt) return aInt < bInt ? -1 : 1;

    // Normalise fractional parts to the same width
    const maxFrac = Math.max(a.fracDigits.length, b.fracDigits.length);
    const aFrac = a.fracDigits.padEnd(maxFrac, "0");
    const bFrac = b.fracDigits.padEnd(maxFrac, "0");
    if (aFrac !== bFrac) return aFrac < bFrac ? -1 : 1;

    return 0;
}

/**
 * Compare two canonical decimal values.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareDecimal(a: CanonicalDecimal, b: CanonicalDecimal): -1 | 0 | 1 {
    if (a.sign !== b.sign) return a.sign === -1 ? -1 : 1;
    const cmp = comparePositiveMagnitude(a, b);
    if (a.sign === 1) return cmp;
    // Both negative: larger magnitude sorts smaller.
    return cmp === 0 ? 0 : (cmp === -1 ? 1 : -1);
}

// ---------------------------------------------------------------------------
// IEEE 754 floating-point comparison
// ---------------------------------------------------------------------------

/**
 * Compare two IEEE 754 floating-point values.
 * Returns -1, 0, 1 for ordered values, or "unordered" when either is NaN.
 */
export function compareFloatingPoint(a: number, b: number): -1 | 0 | 1 | "unordered" {
    if (Number.isNaN(a) || Number.isNaN(b)) return "unordered";
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Digit counting for decimal scale facets
// ---------------------------------------------------------------------------

/**
 * Return the number of significant digits (totalDigits) in a canonical
 * decimal value, per XSD 1.0 Part 2 §4.3.12.
 *
 * Definition: the number of digits in the absolute value, excluding leading
 * zeros in the integer part and trailing zeros in the fractional part.
 * For the value zero, totalDigits = 1.
 */
export function decimalTotalDigits(v: CanonicalDecimal): number {
    const combined = (v.intDigits + v.fracDigits).replace(/^0+/, "");
    return combined === "" ? 1 : combined.length;
}

/**
 * Return the number of fractional digits in a canonical decimal value,
 * per XSD 1.0 Part 2 §4.3.13.
 *
 * Definition: the number of digits after the decimal point in the canonical
 * representation.  For the value zero, fractionDigits = 0.
 */
export function decimalFractionDigits(v: CanonicalDecimal): number {
    return v.fracDigits.length;
}

// ---------------------------------------------------------------------------
// Numeric-family detection
// ---------------------------------------------------------------------------

const DECIMAL_FAMILY_NAMES = new Set([
    "decimal",
    "integer", "nonPositiveInteger", "negativeInteger",
    "long", "int", "short", "byte",
    "nonNegativeInteger", "unsignedLong", "unsignedInt", "unsignedShort", "unsignedByte",
    "positiveInteger",
]);

const INTEGER_FAMILY_NAMES = new Set([
    "integer", "nonPositiveInteger", "negativeInteger",
    "long", "int", "short", "byte",
    "nonNegativeInteger", "unsignedLong", "unsignedInt", "unsignedShort", "unsignedByte",
    "positiveInteger",
]);

export type NumericValueSpace = "decimal" | "float" | "double";

/**
 * Walk the type's base chain to find the nearest numeric-family built-in
 * ancestor and return its value-space family.
 *
 * Returns `null` if the type is not in the numeric family.
 */
export function numericValueSpaceOf(type: SimpleTypeDefinition): NumericValueSpace | null {
    let current: SimpleTypeDefinition | null = type;
    while (current) {
        const name = current.name;
        if (name && name.namespaceURI === NAMESPACE_XSD) {
            const ln = name.localName;
            if (ln === "float")  return "float";
            if (ln === "double") return "double";
            if (DECIMAL_FAMILY_NAMES.has(ln)) return "decimal";
        }
        current = current.baseType;
    }
    return null;
}

/**
 * Walk the type's base chain to find the nearest integer-family built-in
 * ancestor.
 */
export function isIntegerFamily(type: SimpleTypeDefinition): boolean {
    let current: SimpleTypeDefinition | null = type;
    while (current) {
        const name = current.name;
        if (name && name.namespaceURI === NAMESPACE_XSD) {
            if (INTEGER_FAMILY_NAMES.has(name.localName)) return true;
        }
        current = current.baseType;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Main entry point — lexical-space check
// ---------------------------------------------------------------------------

/**
 * Walk the type's base chain to find a numeric-family built-in ancestor and
 * apply its lexical-space check against the (already-normalised) value.
 *
 * Returns an error message string if the value violates the lexical space,
 * or `null` if the value is valid or the type is not in the numeric family.
 */
export function checkNumericFamilyLexicalSpace(
    normalized: string,
    type: SimpleTypeDefinition,
): string | null {
    const family = numericValueSpaceOf(type);
    if (!family) return null;

    switch (family) {
        case "float":
        case "double":
            if (!isValidFloatLexical(normalized)) {
                return `not a valid xs:${family} value`;
            }
            return null;
        case "decimal": {
            if (isIntegerFamily(type)) {
                if (!isValidIntegerLexical(normalized)) {
                    return "not a valid integer value";
                }
            } else {
                if (!isValidDecimalLexical(normalized)) {
                    return "not a valid xs:decimal value";
                }
            }
            return null;
        }
    }
}

// ---------------------------------------------------------------------------
// Numeric facet evaluation (called by facets.ts validateFacets)
// ---------------------------------------------------------------------------

/**
 * Evaluate a single numeric facet against a value.
 *
 * Returns a human-readable error message when the facet is violated, or
 * `null` when the value passes (or the facet does not apply to the type's
 * value space).
 */
export function evaluateNumericFacet(
    normalized: string,
    kind: string,
    facetValue: string,
    type: SimpleTypeDefinition,
): string | null {
    const family = numericValueSpaceOf(type);
    if (!family) return null;

    switch (kind) {
        case "minInclusive":
        case "maxInclusive":
        case "minExclusive":
        case "maxExclusive":
            return evaluateNumericBound(normalized, kind, facetValue, family);
        case "totalDigits":
        case "fractionDigits":
            if (family !== "decimal") return null; // only applicable to decimal-derived
            return evaluateDecimalScaleFacet(normalized, kind, facetValue);
        default:
            return null;
    }
}

/**
 * Evaluate a bound facet (minInclusive, maxInclusive, minExclusive,
 * maxExclusive) against a value.
 */
function evaluateNumericBound(
    normalized: string,
    kind: string,
    facetValue: string,
    family: NumericValueSpace,
): string | null {
    if (family === "float" || family === "double") {
        return evaluateFloatBound(normalized, kind, facetValue, family);
    }

    // Decimal family — exact decimal comparison
    const v = parseDecimal(normalized);
    if (!v) return null; // lexical error already reported elsewhere
    const b = parseDecimal(facetValue);
    if (!b) return null; // malformed facet — compiler-level error, skip

    const cmp = compareDecimal(v, b);
    const ok = kind === "minInclusive" ? cmp >= 0
        : kind === "maxInclusive" ? cmp <= 0
        : kind === "minExclusive" ? cmp > 0
        : kind === "maxExclusive" ? cmp < 0
        : false;

    return ok ? null : `Value must satisfy ${kind} = ${facetValue}.`;
}

/**
 * Evaluate a bound facet on a float/double type using IEEE 754 comparison.
 */
function evaluateFloatBound(
    normalized: string,
    kind: string,
    facetValue: string,
    family: "float" | "double",
): string | null {
    let v = parseFloatingPoint(normalized);
    if (v === null) return null; // lexical error already reported
    let b = parseFloatingPoint(facetValue);
    if (b === null) return null;

    if (family === "float") {
        v = Math.fround(v);
        b = Math.fround(b);
    }

    const cmp = compareFloatingPoint(v, b);
    if (cmp === "unordered") {
        return `Value NaN cannot satisfy ${kind} = ${facetValue}.`;
    }

    const ok = kind === "minInclusive" ? cmp >= 0
        : kind === "maxInclusive" ? cmp <= 0
        : kind === "minExclusive" ? cmp > 0
        : kind === "maxExclusive" ? cmp < 0
        : false;

    return ok ? null : `Value must satisfy ${kind} = ${facetValue}.`;
}

/**
 * Evaluate a totalDigits or fractionDigits facet against a decimal value.
 */
function evaluateDecimalScaleFacet(
    normalized: string,
    kind: string,
    facetValue: string,
): string | null {
    const v = parseDecimal(normalized);
    if (!v) return null;

    // Facet value must be a non-negative integer (schema-level validation later)
    if (!/^\d+$/.test(facetValue)) return null;
    const max = Number(facetValue);
    if (!Number.isFinite(max)) return null;

    if (kind === "totalDigits") {
        const actual = decimalTotalDigits(v);
        if (actual > max) {
            return `Value has ${actual} digit(s), exceeding totalDigits = ${max}.`;
        }
    } else {
        const actual = decimalFractionDigits(v);
        if (actual > max) {
            return `Value has ${actual} fractional digit(s), exceeding fractionDigits = ${max}.`;
        }
    }
    return null;
}