import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { IRefResolver } from "./interfaces";

/**
 * Resolves xs:element ref= placeholders against globally declared schema elements.
 */
export class RefResolver implements IRefResolver {
  private elementsByName: Map<string, XSDElement>;

  constructor(schema: XSDSchema) {
    this.elementsByName = new Map(schema.elements.map((el) => [el.name, el]));
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
}
