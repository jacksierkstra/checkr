import { XSDElement, XSDRestriction, XSDChoice } from "@lib/types/xsd";
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

    const restrictionDef: XSDRestriction = { base: baseType };

    const { children, choices, allowAnyChild } = this.parseRestrictionContainer(restriction);
    if (children.length > 0) restrictionDef.children = children;
    if (choices.length > 0) restrictionDef.choices = choices;

    const attributes = this.parseRestrictionAttributes(restriction);
    if (attributes.length > 0) restrictionDef.attributes = attributes;

    return { restriction: restrictionDef, ...(allowAnyChild ? { allowAnyChild: true } : {}) };
  }

  private parseRestrictionContainer(
    el: Element,
  ): { children: XSDElement[]; choices: XSDChoice[]; allowAnyChild: boolean } {
    const children: XSDElement[] = [];
    const choices: XSDChoice[] = [];
    let allowAnyChild = false;

    Array.from(el.childNodes).forEach((node) => {
      if ((node as Element).nodeType !== 1) return;
      const child = node as Element;

      if (child.localName === "sequence" && child.namespaceURI === XSD_NAMESPACE) {
        const res = this.parseRestrictionContainer(child);
        children.push(...res.children);
        choices.push(...res.choices);
        if (res.allowAnyChild) allowAnyChild = true;
      } else if (child.localName === "choice" && child.namespaceURI === XSD_NAMESPACE) {
        const res = this.parseRestrictionContainer(child);
        if (res.children.length > 0) choices.push({ elements: res.children });
        choices.push(...res.choices);
        if (res.allowAnyChild) allowAnyChild = true;
      } else if (child.localName === "all" && child.namespaceURI === XSD_NAMESPACE) {
        const res = this.parseRestrictionContainer(child);
        children.push(...res.children.map((c) => ({ ...c, inAll: true })));
        choices.push(...res.choices);
        if (res.allowAnyChild) allowAnyChild = true;
      } else if (child.localName === "element" && child.namespaceURI === XSD_NAMESPACE) {
        const name = child.getAttribute("name");
        if (!name) return;
        const minOccursAttr = child.getAttribute("minOccurs");
        const minOccurs = parseInt(
          minOccursAttr && minOccursAttr.trim() !== "" ? minOccursAttr : "1",
          10,
        );
        const maxOccursAttr = child.getAttribute("maxOccurs");
        const maxOccurs =
          maxOccursAttr === "unbounded"
            ? ("unbounded" as const)
            : parseInt(maxOccursAttr && maxOccursAttr.trim() !== "" ? maxOccursAttr : "1", 10);
        const el: XSDElement = { name, minOccurs, maxOccurs };
        const typeAttr = child.getAttribute("type");
        if (typeAttr) el.type = typeAttr;
        children.push(el);
      } else if (child.localName === "any" && child.namespaceURI === XSD_NAMESPACE) {
        allowAnyChild = true;
      }
    });

    return { children, choices, allowAnyChild };
  }

  private parseRestrictionAttributes(
    restriction: Element,
  ): Array<{ name: string; type?: string; use?: "required" | "optional"; fixed?: string; default?: string }> {
    const results: Array<{ name: string; type?: string; use?: "required" | "optional"; fixed?: string; default?: string }> = [];
    const attrNodes = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "attribute");
    Array.from(attrNodes).forEach((attrEl) => {
      const name = attrEl.getAttribute("name");
      if (!name) return;
      const attr: { name: string; type?: string; use?: "required" | "optional"; fixed?: string; default?: string } = { name };
      const type = attrEl.getAttribute("type");
      if (type) attr.type = type;
      const use = attrEl.getAttribute("use");
      if (use === "required" || use === "optional") attr.use = use;
      const fixed = attrEl.getAttribute("fixed");
      if (fixed !== null) attr.fixed = fixed;
      const def = attrEl.getAttribute("default");
      if (def !== null) attr.default = def;
      results.push(attr);
    });
    return results;
  }

  private extractFacets(
    restriction: Element,
  ): Pick<XSDRestriction, "enumeration" | "pattern" | "minLength" | "maxLength" | "length" | "whiteSpace"> {
    const facets: Pick<
      XSDRestriction,
      "enumeration" | "pattern" | "minLength" | "maxLength" | "length" | "whiteSpace"
    > = {};

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

    const lenEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "length")[0];
    if (lenEl) {
      const val = parseInt(lenEl.getAttribute("value") || "", 10);
      if (!isNaN(val)) facets.length = val;
    }

    const whiteSpaceEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "whiteSpace")[0];
    if (whiteSpaceEl) {
      const val = whiteSpaceEl.getAttribute("value");
      if (val === "preserve" || val === "replace" || val === "collapse") {
        facets.whiteSpace = val;
      }
    }

    return facets;
  }

  private parseBasicRestrictionFacets(restriction: Element): Partial<XSDElement> {
    return this.extractFacets(restriction);
  }

  private extractNumericFacets(
    restriction: Element,
  ): Pick<
    XSDElement,
    | "minInclusive"
    | "maxInclusive"
    | "minExclusive"
    | "maxExclusive"
    | "totalDigits"
    | "fractionDigits"
  > {
    const facets: Pick<
      XSDElement,
      | "minInclusive"
      | "maxInclusive"
      | "minExclusive"
      | "maxExclusive"
      | "totalDigits"
      | "fractionDigits"
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

    const totalDigitsEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "totalDigits")[0];
    if (totalDigitsEl) {
      const val = parseInt(totalDigitsEl.getAttribute("value") || "", 10);
      if (!isNaN(val)) {
        restrictionDef.totalDigits = val;
      }
    }

    const fractionDigitsEl = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "fractionDigits")[0];
    if (fractionDigitsEl) {
      const val = parseInt(fractionDigitsEl.getAttribute("value") || "", 10);
      if (!isNaN(val)) {
        restrictionDef.fractionDigits = val;
      }
    }
  }
}
