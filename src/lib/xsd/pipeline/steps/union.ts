import { XSDElement } from "@lib/types/xsd.js";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline.js";
import { parseRestrictionFacets } from "./facetParser.js";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

type InlineMember = NonNullable<XSDElement["unionInlineMembers"]>[number];

export class ParseUnionStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    const simpleType = el.getElementsByTagNameNS(XSD_NAMESPACE, "simpleType")[0] as Element;
    if (!simpleType) return {};

    const unionEl = simpleType.getElementsByTagNameNS(XSD_NAMESPACE, "union")[0] as Element;
    if (!unionEl) return {};

    const result: Partial<XSDElement> = {};

    // Named member types from memberTypes= attribute
    const memberTypesAttr = unionEl.getAttribute("memberTypes");
    if (memberTypesAttr) {
      const types = memberTypesAttr.trim().split(/\s+/).filter(Boolean);
      if (types.length > 0) result.unionMemberTypes = types;
    }

    // Inline xs:simpleType member children
    const inlineSimpleTypes = Array.from(
      unionEl.getElementsByTagNameNS(XSD_NAMESPACE, "simpleType"),
    ).filter((child) => child.parentNode === unionEl);

    if (inlineSimpleTypes.length > 0) {
      const inlineMembers: InlineMember[] = inlineSimpleTypes
        .map((st) => this.parseInlineSimpleType(st))
        .filter((m): m is InlineMember => m !== null);
      if (inlineMembers.length > 0) result.unionInlineMembers = inlineMembers;
    }

    return result;
  }

  private parseInlineSimpleType(simpleType: Element): InlineMember | null {
    const restriction = simpleType.getElementsByTagNameNS(XSD_NAMESPACE, "restriction")[0];
    if (!restriction) return null;

    const base = restriction.getAttribute("base");
    if (!base) return null;

    const member: InlineMember = { type: base };
    const facets = parseRestrictionFacets(restriction);
    if (facets.enumeration) member.enumeration = facets.enumeration;
    if (facets.pattern !== undefined) member.pattern = facets.pattern;
    if (facets.minInclusive !== undefined) member.minInclusive = facets.minInclusive;
    if (facets.maxInclusive !== undefined) member.maxInclusive = facets.maxInclusive;
    if (facets.minExclusive !== undefined) member.minExclusive = facets.minExclusive;
    if (facets.maxExclusive !== undefined) member.maxExclusive = facets.maxExclusive;
    return member;
  }
}
