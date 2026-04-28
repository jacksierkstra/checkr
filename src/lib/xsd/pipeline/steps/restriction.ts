import { XSDElement, XSDRestriction } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseRestrictionsStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    // Handle a top-level xs:simpleType element (el IS the simpleType, not a wrapper)
    if (el.localName === "simpleType") {
      return this.parseSimpleTypeRestriction(el);
    }

    const simpleType = el.getElementsByTagNameNS(XSD_NAMESPACE, "simpleType")[0];
    if (simpleType) {
      return this.parseSimpleTypeRestriction(simpleType);
    }

    const complexType = el.getElementsByTagNameNS(XSD_NAMESPACE, "complexType")[0];
    if (complexType) {
      const restriction = complexType.getElementsByTagNameNS(XSD_NAMESPACE, "restriction")[0];
      if (restriction) {
        return this.parseComplexTypeRestriction(restriction);
      }
    }

    return {};
  }

  private parseSimpleTypeRestriction(simpleType: Element): Partial<XSDElement> {
    const restriction = simpleType.getElementsByTagNameNS(XSD_NAMESPACE, "restriction")[0];
    if (!restriction) return {};

    const result: Partial<XSDElement> = {};
    const baseType = restriction.getAttribute("base");

    if (baseType && baseType.startsWith("xs:")) {
      result.type = baseType;
    } else if (baseType) {
      const restrictionDef: XSDRestriction = {
        base: baseType,
      };

      this.parseRestrictionFacets(restriction, restrictionDef);

      result.restriction = restrictionDef;
      return result;
    }

    const restrictionFacets = this.parseBasicRestrictionFacets(restriction);
    const numericFacets = this.extractNumericFacets(restriction);
    return { ...result, ...restrictionFacets, ...numericFacets };
  }

  private parseComplexTypeRestriction(restriction: Element): Partial<XSDElement> {
    const baseType = restriction.getAttribute("base");
    if (!baseType) return {};

    const restrictionDef: XSDRestriction = {
      base: baseType,
    };

    return {
      restriction: restrictionDef,
    };
  }

  private extractFacets(
    restriction: Element,
  ): Pick<XSDRestriction, "enumeration" | "pattern" | "minLength" | "maxLength"> {
    const facets: Pick<XSDRestriction, "enumeration" | "pattern" | "minLength" | "maxLength"> = {};

    const enumNodes = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "enumeration");
    if (enumNodes.length > 0) {
      facets.enumeration = Array.from(enumNodes).map(
        (enumNode) => enumNode.getAttribute("value") || "",
      );
    }

    const patternEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "pattern")[0];
    if (patternEl) {
      const regex = patternEl.getAttribute("value");
      if (regex) facets.pattern = regex;
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

    return facets;
  }

  private parseBasicRestrictionFacets(restriction: Element): Partial<XSDElement> {
    return this.extractFacets(restriction);
  }

  private extractNumericFacets(
    restriction: Element,
  ): Pick<XSDElement, "minInclusive" | "maxInclusive" | "minExclusive" | "maxExclusive"> {
    const facets: Pick<
      XSDElement,
      "minInclusive" | "maxInclusive" | "minExclusive" | "maxExclusive"
    > = {};

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

    return facets;
  }

  private parseRestrictionFacets(restriction: Element, restrictionDef: XSDRestriction): void {
    Object.assign(restrictionDef, this.extractFacets(restriction));
    this.parseNumericRestrictionConstraints(restriction, restrictionDef);
  }

  private parseNumericRestrictionConstraints(
    restriction: Element,
    restrictionDef: XSDRestriction,
  ): void {
    const minInclusiveEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "minInclusive")[0];
    if (minInclusiveEl) {
      const val = parseFloat(minInclusiveEl.getAttribute("value") || "");
      if (!isNaN(val)) {
        restrictionDef.minInclusive = val;
      }
    }

    const maxInclusiveEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "maxInclusive")[0];
    if (maxInclusiveEl) {
      const val = parseFloat(maxInclusiveEl.getAttribute("value") || "");
      if (!isNaN(val)) {
        restrictionDef.maxInclusive = val;
      }
    }

    const minExclusiveEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "minExclusive")[0];
    if (minExclusiveEl) {
      const val = parseFloat(minExclusiveEl.getAttribute("value") || "");
      if (!isNaN(val)) {
        restrictionDef.minExclusive = val;
      }
    }

    const maxExclusiveEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "maxExclusive")[0];
    if (maxExclusiveEl) {
      const val = parseFloat(maxExclusiveEl.getAttribute("value") || "");
      if (!isNaN(val)) {
        restrictionDef.maxExclusive = val;
      }
    }
  }
}
