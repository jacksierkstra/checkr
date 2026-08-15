/**
 * Facet framework for XSD 1.0 simple-type validation (CHK-010).
 *
 * Provides whitespace normalization, code-point-correct length counting,
 * facet inheritance down restriction chains, and facet validation for
 * the length family and enumeration. Numeric bounds, totalDigits, and
 * fractionDigits are attached to effective facets but not evaluated
 * (CHK-012); pattern is attached but not evaluated (CHK-015).
 */

import { Facet, SimpleTypeDefinition, WhiteSpaceValue } from "@lib/types/component-graph";
import { evaluateNumericFacet } from "@lib/xsd/numeric-types";
import { evaluateDateTimeBoundFromType } from "@lib/xsd/datetime-types";
import { binaryOctetLength } from "@lib/xsd/remaining-types";
import { compileXsdRegex, XsdRegex, XsdRegexError } from "@lib/xsd/regex";

// ---------------------------------------------------------------------------
// Whitespace normalization (XSD 1.0 Part 2 §4.3.6)
// ---------------------------------------------------------------------------

/**
 * Normalize whitespace per the specified mode.
 * - preserve: no change
 * - replace: #x9, #xA, #xD → #x20
 * - collapse: after replace, collapse runs of #x20 to one, trim
 */
export function normalizeWhiteSpace(value: string, mode: WhiteSpaceValue): string {
    switch (mode) {
        case "preserve":
            return value;
        case "replace":
            return value.replace(/[\t\n\r]/g, " ");
        case "collapse":
            // Replace first, then collapse runs, then trim
            return value
                .replace(/[\t\n\r]/g, " ")
                .replace(/ {2,}/g, " ")
                .trim();
    }
}

// ---------------------------------------------------------------------------
// Code-point counting (XSD 1.0 Part 2 §4.3.3, length facet)
// ---------------------------------------------------------------------------

/**
 * Return the number of Unicode code points in `value`.
 * Uses `Array.from` which iterates by code point, not UTF-16 code unit.
 * See gap-analysis §6.2: `text.length` is wrong on supplementary characters.
 */
export function codePointLength(value: string): number {
    return Array.from(value).length;
}

// ---------------------------------------------------------------------------
// Facet inheritance
// ---------------------------------------------------------------------------

/**
 * Compute the effective facets for a simple type, walking the restriction
 * chain to inherit facets from the base type.
 *
 * Rules:
 * - For each facet kind, the derived type's own facet overrides the base's.
 * - `pattern` facets accumulate (all patterns from base chain + own apply).
 * - `enumeration` in the derived type replaces the base's enumeration
 *   (if the derived specifies no enumeration, the base's is inherited).
 * - `whiteSpace` is handled separately (see `computeWhiteSpace`).
 * - Numeric bounds and totalDigits/fractionDigits: own overrides base.
 *
 * This mirrors the XSD 1.0 Part 2 §4.3 derivation rules.
 */
export function computeEffectiveFacets(
    own: ReadonlyArray<Facet>,
    base: SimpleTypeDefinition | null,
): ReadonlyArray<Facet> {
    const baseFacets = base ? base.effectiveFacets : [];

    // Separate patterns from non-patterns
    const ownPatterns = own.filter((f) => f.kind === "pattern");
    const basePatterns = baseFacets.filter((f) => f.kind === "pattern");

    // Non-pattern facets: derived wins over base per kind
    const ownNonPattern = own.filter((f) => f.kind !== "pattern" && f.kind !== "whiteSpace");
    const baseNonPattern = baseFacets.filter((f) => f.kind !== "pattern" && f.kind !== "whiteSpace");

    const merged: Facet[] = [];
    const ownKinds = new Set(ownNonPattern.map((f) => f.kind));

    // Add derived's own facets first
    merged.push(...ownNonPattern);

    // Add base's facets for kinds not overridden by derived
    for (const f of baseNonPattern) {
        if (!ownKinds.has(f.kind)) {
            merged.push(f);
        }
    }

    // Patterns accumulate: base patterns first, then own (order matters for
    // validation — all must match)
    merged.push(...basePatterns, ...ownPatterns);

    return merged;
}

/**
 * Compute the effective whitespace normalization for a simple type.
 *
 * If the type specifies its own `whiteSpace` facet, that wins.
 * Otherwise, inherit from the base type.
 * Falls back to "preserve" for root types (no base, no explicit whiteSpace).
 */
export function computeWhiteSpace(
    own: ReadonlyArray<Facet>,
    base: SimpleTypeDefinition | null,
): WhiteSpaceValue {
    const ownWs = own.find((f) => f.kind === "whiteSpace");
    if (ownWs) {
        return parseWhiteSpaceValue(ownWs.value);
    }
    return base?.whiteSpace ?? "preserve";
}

function parseWhiteSpaceValue(value: string): WhiteSpaceValue {
    switch (value) {
        case "replace":
            return "replace";
        case "collapse":
            return "collapse";
        default:
            return "preserve";
    }
}

// ---------------------------------------------------------------------------
// List splitting (XSD 1.0 Part 2 §3.4.1)
// ---------------------------------------------------------------------------

/**
 * Split a whitespace-normalized list value into its items.
 *
 * The value MUST already be whitespace-collapsed (a list type's `whiteSpace`
 * is fixed to `collapse`), so only single #x20 separators remain. The empty
 * string is the empty list (zero items).
 */
export function splitListItems(value: string): string[] {
    const trimmed = value.trim();
    if (trimmed.length === 0) return [];
    return trimmed.split(/\s+/);
}

/** Item-wise equality of two list values (XSD 1.0 Part 2 §4.3.5.2). */
function listItemsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Facet validation
// ---------------------------------------------------------------------------

export interface FacetViolation {
    readonly facet: string;
    readonly message: string;
}

/**
 * Validate a normalized value against a set of effective facets.
 *
 * Evaluates: length, minLength, maxLength, enumeration, the four numeric
 * bound facets, totalDigits and fractionDigits (CHK-012).
 * pattern is reserved for CHK-015.
 *
 * The optional `type` provides the value-space context needed to evaluate
 * numeric facets (decimal vs float vs double). Without it, numeric facets
 * are skipped.
 *
 * Returns an array of violations (empty = valid).
 */
// ---------------------------------------------------------------------------
// Pattern facet compilation cache (CHK-015)
// ---------------------------------------------------------------------------

/**
 * Module-level cache for compiled XSD regex patterns.
 * Patterns are immutable strings keyed by the facet value; the cache is
 * bounded by the number of distinct pattern strings in the schema, which is
 * small in practice.
 */
const patternCache = new Map<string, XsdRegex>();

function compilePatternFacet(value: string): XsdRegex {
    let re = patternCache.get(value);
    if (!re) {
        re = compileXsdRegex(value);
        patternCache.set(value, re);
    }
    return re;
}

export function validateFacets(
    normalized: string,
    facets: ReadonlyArray<Facet>,
    type?: SimpleTypeDefinition | null,
): FacetViolation[] {
    const violations: FacetViolation[] = [];

    // Separate enumeration facets from the rest
    const enumerations: string[] = [];
    const nonEnumFacets: Facet[] = [];

    for (const f of facets) {
        if (f.kind === "enumeration") {
            enumerations.push(f.value);
        } else {
            nonEnumFacets.push(f);
        }
    }

    // Check enumeration: if present, value must match at least one.
    // For list types the facet values are themselves list literals and the
    // comparison is item-wise after whitespace splitting (XSD 1.0 §4.3.5.2).
    if (enumerations.length > 0) {
        const matched = type?.variety === "list"
            ? enumerations.some((e) => listItemsEqual(splitListItems(e), splitListItems(normalized)))
            : enumerations.some((e) => e === normalized);
        if (!matched) {
            violations.push({
                facet: "enumeration",
                message: `Value '${normalized}' is not one of the enumerated values {${enumerations.join(", ")}}.`,
            });
        }
    }

    // Check length-family facets
    // Length unit depends on the value space: list types count items,
    // hexBinary/base64Binary count octets, all other types count code points.
    const lengthUnit = (t: SimpleTypeDefinition | null | undefined): string => {
        if (t?.variety === "list") return "item(s)";
        if (t && binaryOctetLength("", t) !== null) return "octet(s)";
        return "character(s)";
    };
    const lengthOf = (t: SimpleTypeDefinition | null | undefined, value: string): number => {
        if (t?.variety === "list") return splitListItems(value).length;
        if (t) return binaryOctetLength(value, t) ?? codePointLength(value);
        return codePointLength(value);
    };
    for (const f of nonEnumFacets) {
        switch (f.kind) {
            case "length": {
                const expected = Number(f.value);
                const actual = lengthOf(type, normalized);
                if (actual !== expected) {
                    violations.push({
                        facet: "length",
                        message: `Value must have exactly ${expected} ${lengthUnit(type)}, but has ${actual}.`,
                    });
                }
                break;
            }
            case "minLength": {
                const min = Number(f.value);
                const actual = lengthOf(type, normalized);
                if (actual < min) {
                    violations.push({
                        facet: "minLength",
                        message: `Value must have at least ${min} ${lengthUnit(type)}, but has ${actual}.`,
                    });
                }
                break;
            }
            case "maxLength": {
                const max = Number(f.value);
                const actual = lengthOf(type, normalized);
                if (actual > max) {
                    violations.push({
                        facet: "maxLength",
                        message: `Value must have at most ${max} ${lengthUnit(type)}, but has ${actual}.`,
                    });
                }
                break;
            }
            // Numeric bounds and scale facets — CHK-012
            case "minInclusive":
            case "maxInclusive":
            case "minExclusive":
            case "maxExclusive":
            case "totalDigits":
            case "fractionDigits": {
                if (type) {
                    const message = evaluateNumericFacet(normalized, f.kind, f.value, type);
                    if (message !== null) {
                        violations.push({ facet: f.kind, message });
                    }
                    // Also try datetime bound evaluation (CHK-013) for date/time types
                    const dtMessage = evaluateDateTimeBoundFromType(normalized, f.kind, f.value, type);
                    if (dtMessage !== null) {
                        violations.push({ facet: f.kind, message: dtMessage });
                    }
                }
                break;
            }
            // Pattern — CHK-015
            case "pattern": {
                const re = compilePatternFacet(f.value);
                if (!re.matches(normalized)) {
                    violations.push({
                        facet: "pattern",
                        message: `Value does not match the required pattern '${f.value}'.`,
                    });
                }
                break;
            }
            default:
                // Unknown facet kind — ignore.
                break;
        }
    }

    return violations;
}