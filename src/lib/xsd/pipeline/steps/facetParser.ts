import { XSDRestriction } from "@lib/types/xsd.js";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export type RestrictionFacetFields = Pick<
  XSDRestriction,
  | "enumeration"
  | "pattern"
  | "minLength"
  | "maxLength"
  | "length"
  | "minInclusive"
  | "maxInclusive"
  | "minExclusive"
  | "maxExclusive"
  | "totalDigits"
  | "fractionDigits"
  | "whiteSpace"
>;

export const parseRestrictionFacets = (restriction: Element): Partial<RestrictionFacetFields> => {
  const facets: Partial<RestrictionFacetFields> = {};

  const enumNodes = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "enumeration");
  if (enumNodes.length > 0) {
    facets.enumeration = Array.from(enumNodes).map((enumNode) => enumNode.getAttribute("value") || "");
  }

  const patternEls = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "pattern");
  if (patternEls.length > 0) {
    // Multiple xs:pattern facets are a union (OR) — join as alternation per XSD 1.0 §4.3.4
    const patterns = Array.from(patternEls)
      .map((el) => el.getAttribute("value"))
      .filter((v): v is string => v !== null && v.length > 0);
    if (patterns.length > 0) {
      facets.pattern = patterns.length === 1 ? patterns[0] : patterns.map((p) => `(?:${p})`).join("|");
    }
  }

  const minLenEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "minLength")[0];
  if (minLenEl) {
    const val = parseInt(minLenEl.getAttribute("value") || "", 10);
    if (!isNaN(val)) facets.minLength = val;
  }

  const maxLenEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "maxLength")[0];
  if (maxLenEl) {
    const val = parseInt(maxLenEl.getAttribute("value") || "", 10);
    if (!isNaN(val)) facets.maxLength = val;
  }

  const lenEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "length")[0];
  if (lenEl) {
    const val = parseInt(lenEl.getAttribute("value") || "", 10);
    if (!isNaN(val)) facets.length = val;
  }

  const minInclusiveEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "minInclusive")[0];
  if (minInclusiveEl) {
    const val = parseFloat(minInclusiveEl.getAttribute("value") || "");
    if (!isNaN(val)) facets.minInclusive = val;
  }

  const maxInclusiveEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "maxInclusive")[0];
  if (maxInclusiveEl) {
    const val = parseFloat(maxInclusiveEl.getAttribute("value") || "");
    if (!isNaN(val)) facets.maxInclusive = val;
  }

  const minExclusiveEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "minExclusive")[0];
  if (minExclusiveEl) {
    const val = parseFloat(minExclusiveEl.getAttribute("value") || "");
    if (!isNaN(val)) facets.minExclusive = val;
  }

  const maxExclusiveEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "maxExclusive")[0];
  if (maxExclusiveEl) {
    const val = parseFloat(maxExclusiveEl.getAttribute("value") || "");
    if (!isNaN(val)) facets.maxExclusive = val;
  }

  const totalDigitsEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "totalDigits")[0];
  if (totalDigitsEl) {
    const val = parseInt(totalDigitsEl.getAttribute("value") || "", 10);
    if (!isNaN(val)) facets.totalDigits = val;
  }

  const fractionDigitsEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "fractionDigits")[0];
  if (fractionDigitsEl) {
    const val = parseInt(fractionDigitsEl.getAttribute("value") || "", 10);
    if (!isNaN(val)) facets.fractionDigits = val;
  }

  const whiteSpaceEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "whiteSpace")[0];
  if (whiteSpaceEl) {
    const val = whiteSpaceEl.getAttribute("value");
    if (val === "preserve" || val === "replace" || val === "collapse") {
      facets.whiteSpace = val;
    }
  }

  return facets;
};
