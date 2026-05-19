import { XSDElement, XSDAttribute, XSDSchema } from "@lib/types/xsd.js";
import { IRefResolver } from "./interfaces.js";

/**
 * Resolves xs:element ref= and xs:attribute ref= placeholders against globally declared schema items.
 */
export class RefResolver implements IRefResolver {
  private elementsByName: Map<string, XSDElement>;
  private globalAttributes: Map<string, XSDAttribute>;

  constructor(schema: XSDSchema) {
    this.elementsByName = new Map(schema.elements.map((el) => [el.name, el]));
    this.globalAttributes = new Map(Object.entries(schema.globalAttributes ?? {}));
  }

  resolveElementRef(
    ref: string,
    minOccurs?: number,
    maxOccurs?: number | "unbounded",
  ): XSDElement | undefined {
    const globalDef = this.elementsByName.get(ref);
    if (!globalDef) return undefined;

    const resolved: XSDElement = { ...globalDef };
    // Occurrence constraints at the ref site override the global definition's defaults
    if (minOccurs !== undefined) resolved.minOccurs = minOccurs;
    if (maxOccurs !== undefined) resolved.maxOccurs = maxOccurs;
    // Clear the ref marker so the resolved element is treated as a normal element
    resolved.ref = undefined;
    return resolved;
  }

  resolveAttributeRef(ref: string, useOverride?: string): XSDAttribute | undefined {
    const globalDef = this.globalAttributes.get(ref);
    if (!globalDef) return undefined;

    const resolved: XSDAttribute = { ...globalDef };
    // The ref site may explicitly override `use`; if not set, inherit from the global declaration
    if (useOverride !== undefined) {
      resolved.use = useOverride as "required" | "optional" | "prohibited";
    }
    // Clear the ref marker so the resolved attribute is treated as a normal attribute
    resolved.ref = undefined;
    return resolved;
  }
}
