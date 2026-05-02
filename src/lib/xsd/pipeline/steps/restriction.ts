import { XSDElement, XSDRestriction, XSDChoice } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";
import { parseRestrictionFacets } from "./facetParser";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseRestrictionsStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    // Handle a top-level xs:simpleType element (el IS the simpleType, not a wrapper)
    if (el.localName === "simpleType") {
      return this.parseSimpleTypeRestriction(el);
    }

    // Handle a top-level xs:complexType element (named type with complex content restriction)
    if (el.localName === "complexType" && el.namespaceURI === XSD_NAMESPACE) {
      const complexContent = el.getElementsByTagNameNS(XSD_NAMESPACE, "complexContent")[0];
      const restriction = el.getElementsByTagNameNS(XSD_NAMESPACE, "restriction")[0];
      if (restriction) {
        const parsed = this.parseComplexTypeRestriction(restriction);
        const mixedAttr = complexContent?.getAttribute("mixed") ?? el.getAttribute("mixed");
        if (mixedAttr === "true") parsed.mixed = true;
        return parsed;
      }
      return {};
    }

    const simpleType = el.getElementsByTagNameNS(XSD_NAMESPACE, "simpleType")[0];
    if (simpleType) {
      return this.parseSimpleTypeRestriction(simpleType);
    }

    const complexType = el.getElementsByTagNameNS(XSD_NAMESPACE, "complexType")[0];
    if (complexType) {
      const complexContent = complexType.getElementsByTagNameNS(XSD_NAMESPACE, "complexContent")[0];
      const restriction = complexType.getElementsByTagNameNS(XSD_NAMESPACE, "restriction")[0];
      if (restriction) {
        const parsed = this.parseComplexTypeRestriction(restriction);
        // xs:complexContent mixed= overrides xs:complexType mixed= per XSD 1.0 §3.8.3
        const mixedAttr =
          complexContent?.getAttribute("mixed") ?? complexType.getAttribute("mixed");
        if (mixedAttr === "true") parsed.mixed = true;
        return parsed;
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

      Object.assign(restrictionDef, parseRestrictionFacets(restriction));

      result.restriction = restrictionDef;
      return result;
    }

    return { ...result, ...parseRestrictionFacets(restriction) };
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

  private parseRestrictionContainer(el: Element): {
    children: XSDElement[];
    choices: XSDChoice[];
    allowAnyChild: boolean;
  } {
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
      } else if (child.localName === "group" && child.namespaceURI === XSD_NAMESPACE) {
        const ref = child.getAttribute("ref");
        if (!ref) return;
        const localRef = ref.replace(/^.*:/, "");
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
        children.push({ name: localRef, groupRef: localRef, minOccurs, maxOccurs });
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
        const form = child.getAttribute("form");
        if (form === "qualified" || form === "unqualified") el.form = form;
        const block = child.getAttribute("block");
        if (block !== null) el.block = block;
        const final = child.getAttribute("final");
        if (final !== null) el.final = final;
        children.push(el);
      } else if (child.localName === "any" && child.namespaceURI === XSD_NAMESPACE) {
        allowAnyChild = true;
      }
    });

    return { children, choices, allowAnyChild };
  }

  private parseRestrictionAttributes(restriction: Element): Array<{
    name: string;
    type?: string;
    use?: "required" | "optional" | "prohibited";
    fixed?: string;
    default?: string;
    attributeGroupRef?: string;
  }> {
    const results: Array<{
      name: string;
      type?: string;
      use?: "required" | "optional" | "prohibited";
      fixed?: string;
      default?: string;
      attributeGroupRef?: string;
    }> = [];
    const attrNodes = restriction.getElementsByTagNameNS(XSD_NAMESPACE, "attribute");
    Array.from(attrNodes).forEach((attrEl) => {
      const name = attrEl.getAttribute("name");
      const ref = attrEl.getAttribute("ref");
      if (!name && !ref) return;
      if (!name && ref) {
        const localRef = ref.replace(/^.*:/, "");
        results.push({ name: localRef, attributeGroupRef: localRef, use: "optional" });
        return;
      }
      const attr: {
        name: string;
        type?: string;
        use?: "required" | "optional" | "prohibited";
        fixed?: string;
        default?: string;
      } = { name: name! };
      const type = attrEl.getAttribute("type");
      if (type) attr.type = type;
      const use = attrEl.getAttribute("use");
      if (use === "required" || use === "optional" || use === "prohibited") attr.use = use;
      const fixed = attrEl.getAttribute("fixed");
      if (fixed !== null) attr.fixed = fixed;
      const def = attrEl.getAttribute("default");
      if (def !== null) attr.default = def;
      results.push(attr);
    });
    return results;
  }
}
