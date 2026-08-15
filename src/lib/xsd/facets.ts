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

    // Check enumeration: if present, value must match at least one
    if (enumerations.length > 0) {
        const matched = enumerations.some((e) => e === normalized);
        if (!matched) {
            violations.push({
                facet: "enumeration",
                message: `Value '${normalized}' is not one of the enumerated values {${enumerations.join(", ")}}.`,
            });
        }
    }

    // Check length-family facets
    for (const f of nonEnumFacets) {
        switch (f.kind) {
            case "length": {
                const expected = Number(f.value);
                const actual = codePointLength(normalized);
                if (actual !== expected) {
                    violations.push({
                        facet: "length",
                        message: `Value must have exactly ${expected} character(s) (code points), but has ${actual}.`,
                    });
                }
                break;
            }
            case "minLength": {
                const min = Number(f.value);
                const actual = codePointLength(normalized);
                if (actual < min) {
                    violations.push({
                        facet: "minLength",
                        message: `Value must have at least ${min} character(s) (code points), but has ${actual}.`,
                    });
                }
                break;
            }
            case "maxLength": {
                const max = Number(f.value);
                const actual = codePointLength(normalized);
                if (actual > max) {
                    violations.push({
                        facet: "maxLength",
                        message: `Value must have at most ${max} character(s) (code points), but has ${actual}.`,
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
                }
                break;
            }
            // Pattern — CHK-015
            case "pattern":
                // Not evaluated yet.
                break;
            default:
                // Unknown facet kind — ignore.
                break;
        }
    }

    return violations;
}