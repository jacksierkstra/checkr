import { XSDElement, XSDAttribute } from "@lib/types/xsd";
import { IPropertyMerger } from "./interfaces";

/**
 * Handles merging of properties from type definitions into elements
 */
export class PropertyMerger implements IPropertyMerger {
  /**
   * Merges properties from a resolved type definition into an element
   * @param element The target element
   * @param typeDef The source type definition
   * @returns The element with merged properties
   */
  mergeTypeDefinition(element: XSDElement, typeDef: XSDElement): XSDElement {
    // Create a new element as the base for merging
    const result: XSDElement = { ...element };
    
    // For children: if typeDef has children, use them, otherwise keep element's children
    if (typeDef.children && typeDef.children.length > 0) {
      result.children = [...typeDef.children];
    } else if (element.children) {
      // Explicitly preserve existing children if type has none
      result.children = [...element.children];
    }
    
    // For choices: if typeDef has choices, use them, otherwise keep element's choices
    if (typeDef.choices && typeDef.choices.length > 0) {
      result.choices = [...typeDef.choices];
    } else if (element.choices) {
      // Explicitly preserve existing choices if type has none
      result.choices = [...element.choices];
    }

    // Merge attributes with proper overriding
    result.attributes = this.mergeAttributes(typeDef.attributes, element.attributes);
    
    // Handle all other facets with proper precedence
    result.enumeration = element.enumeration || typeDef.enumeration;
    result.pattern = element.pattern !== undefined ? element.pattern : typeDef.pattern;
    result.minLength = element.minLength !== undefined ? element.minLength : typeDef.minLength;
    result.maxLength = element.maxLength !== undefined ? element.maxLength : typeDef.maxLength;
    result.minInclusive = element.minInclusive !== undefined ? element.minInclusive : typeDef.minInclusive;
    result.maxInclusive = element.maxInclusive !== undefined ? element.maxInclusive : typeDef.maxInclusive;
    result.minExclusive = element.minExclusive !== undefined ? element.minExclusive : typeDef.minExclusive;
    result.maxExclusive = element.maxExclusive !== undefined ? element.maxExclusive : typeDef.maxExclusive;
    result.abstract = element.abstract !== undefined ? element.abstract : typeDef.abstract;
    
    // Clear processing flags to prevent further processing
    result.extension = undefined;
    result.restriction = undefined;
    
    return result;
  }

  /**
   * Merges attribute collections with proper precedence
   * @param baseAttrs The base attributes
   * @param overridingAttrs The overriding attributes
   * @returns The merged attribute collection
   */
  mergeAttributes(baseAttrs?: XSDAttribute[], overridingAttrs?: XSDAttribute[]): XSDAttribute[] | undefined {
    const effectiveBaseAttrs = baseAttrs || [];
    const effectiveOverridingAttrs = overridingAttrs || [];

    if (effectiveBaseAttrs.length === 0 && effectiveOverridingAttrs.length === 0) {
      return undefined;
    }

    // Create a map with base attributes
    const attrMap = new Map(effectiveBaseAttrs.map(attr => [attr.name, attr]));
    
    // Override with specific attributes
    for (const overrideAttr of effectiveOverridingAttrs) {
      attrMap.set(overrideAttr.name, overrideAttr);
    }
    
    return Array.from(attrMap.values());
  }
}
