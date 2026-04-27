import { XSDElement, XSDRestriction } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseRestrictionsStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
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
    return { ...result, ...restrictionFacets };
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

  private parseBasicRestrictionFacets(restriction: Element): Partial<XSDElement> {
    const result: Partial<XSDElement> = {};

    const enumNodes = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "enumeration");
    const enumeration = Array.from(enumNodes).map(
      (enumNode) => enumNode.getAttribute("value") || "",
    );
    if (enumeration.length > 0) {
      result.enumeration = enumeration;
    }

    const patternEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "pattern")[0];
    if (patternEl) {
      const regex = patternEl.getAttribute("value");
      if (regex) {
        result.pattern = regex;
      }
    }

    const minLenEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "minLength")[0];
    if (minLenEl) {
      const val = parseInt(minLenEl.getAttribute("value") || "", 10);
      if (!isNaN(val)) {
        result.minLength = val;
      }
    }

    const maxLenEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "maxLength")[0];
    if (maxLenEl) {
      const val = parseInt(maxLenEl.getAttribute("value") || "", 10);
      if (!isNaN(val)) {
        result.maxLength = val;
      }
    }

    this.parseNumericConstraints(restriction, result);

    return result;
  }

  private parseRestrictionFacets(restriction: Element, restrictionDef: XSDRestriction): void {
    const enumNodes = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "enumeration");
    if (enumNodes.length > 0) {
      restrictionDef.enumeration = Array.from(enumNodes).map(
        (enumNode) => enumNode.getAttribute("value") || "",
      );
    }

    const patternEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "pattern")[0];
    if (patternEl) {
      const regex = patternEl.getAttribute("value");
      if (regex) {
        restrictionDef.pattern = regex;
      }
    }

    const minLenEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "minLength")[0];
    if (minLenEl) {
      const val = parseInt(minLenEl.getAttribute("value") || "", 10);
      if (!isNaN(val)) {
        restrictionDef.minLength = val;
      }
    }

    const maxLenEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "maxLength")[0];
    if (maxLenEl) {
      const val = parseInt(maxLenEl.getAttribute("value") || "", 10);
      if (!isNaN(val)) {
        restrictionDef.maxLength = val;
      }
    }

    this.parseNumericRestrictionConstraints(restriction, restrictionDef);
  }

  private parseNumericConstraints(_restriction: Element, _result: Partial<XSDElement>): void {
    // No direct numeric constraints on XSDElement yet
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
