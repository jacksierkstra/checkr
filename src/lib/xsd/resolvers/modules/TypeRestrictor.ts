import { XSDElement } from "@lib/types/xsd";
import { 
  ITypeRestrictor, 
  ITypeRegistry, 
  IResolutionCache,
  IElementResolver
} from "./interfaces";

/**
 * Handles resolution of type restrictions
 */
export class TypeRestrictor implements ITypeRestrictor {
  /**
   * Creates a new type restrictor
   * @param registry The type registry for type lookups
   * @param cache The resolution cache
   * @param elementResolver The element resolver for nested resolution
   */
  constructor(
    private registry: ITypeRegistry,
    private cache: IResolutionCache,
    private elementResolver: IElementResolver
  ) {}

  /**
   * Resolves an element with a restriction definition
   * @param element The element with a restriction to process
   * @returns The element with restriction resolved
   */
  resolveRestriction(element: XSDElement): XSDElement {
    if (!element.restriction) {
      return element;
    }

    const baseTypeName = element.restriction.base;
    const baseTypeDef = this.registry.getTypeDefinition(baseTypeName);

    if (!baseTypeDef) {
      // Base type not found, apply restriction facets directly
      const resultOnError = { ...element };
      
      // Transfer restriction facets to element
      if (element.restriction.enumeration) resultOnError.enumeration = element.restriction.enumeration;
      if (element.restriction.pattern !== undefined) resultOnError.pattern = element.restriction.pattern;
      if (element.restriction.minLength !== undefined) resultOnError.minLength = element.restriction.minLength;
      if (element.restriction.maxLength !== undefined) resultOnError.maxLength = element.restriction.maxLength;
      if (element.restriction.minInclusive !== undefined) resultOnError.minInclusive = element.restriction.minInclusive;
      if (element.restriction.maxInclusive !== undefined) resultOnError.maxInclusive = element.restriction.maxInclusive;
      if (element.restriction.minExclusive !== undefined) resultOnError.minExclusive = element.restriction.minExclusive;
      if (element.restriction.maxExclusive !== undefined) resultOnError.maxExclusive = element.restriction.maxExclusive;
      
      resultOnError.restriction = undefined; // Clear the restriction flag
      return resultOnError;
    }

    // Check if this base type is already in the cache
    const cacheKey = this.cache.generateKey(baseTypeName);
    let resolvedBaseElement: XSDElement;
    
    const cachedDef = this.cache.get(cacheKey);
    if (cachedDef) {
      resolvedBaseElement = cachedDef;
    } else {
      // Resolve the base type
      resolvedBaseElement = this.elementResolver.resolveElement({ ...baseTypeDef });
      // Cache it for future use
      this.cache.set(cacheKey, resolvedBaseElement);
    }

    // Start with resolved base and apply restriction facets
    const result = { ...resolvedBaseElement };
    
    // Override with restriction facets
    if (element.restriction.enumeration) result.enumeration = element.restriction.enumeration;
    if (element.restriction.pattern !== undefined) result.pattern = element.restriction.pattern;
    if (element.restriction.minLength !== undefined) result.minLength = element.restriction.minLength;
    if (element.restriction.maxLength !== undefined) result.maxLength = element.restriction.maxLength;
    if (element.restriction.minInclusive !== undefined) result.minInclusive = element.restriction.minInclusive;
    if (element.restriction.maxInclusive !== undefined) result.maxInclusive = element.restriction.maxInclusive;
    if (element.restriction.minExclusive !== undefined) result.minExclusive = element.restriction.minExclusive;
    if (element.restriction.maxExclusive !== undefined) result.maxExclusive = element.restriction.maxExclusive;

    return {
      ...result,
      name: element.name,
      namespace: element.namespace,
      minOccurs: element.minOccurs,
      maxOccurs: element.maxOccurs,
      type: resolvedBaseElement.type,
      extension: undefined, // Clear processing flags
      restriction: undefined,
      abstract: element.abstract !== undefined ? element.abstract : resolvedBaseElement.abstract,
    };
  }
}
