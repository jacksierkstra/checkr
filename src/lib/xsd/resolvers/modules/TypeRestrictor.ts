import { XSDElement } from "@lib/types/xsd";
import { ITypeRestrictor, ITypeRegistry, IResolutionCache, IElementResolver } from "./interfaces";

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
    private elementResolver: IElementResolver,
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
      this.applyRestrictionFacets(resultOnError, element);
      resultOnError.restriction = undefined;
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
    this.applyRestrictionFacets(result, element);

    // If the restriction defines its own content model, it replaces the base's
    if (element.restriction!.children !== undefined) {
      result.children = element.restriction!.children;
    }
    if (element.restriction!.choices !== undefined) {
      result.choices = element.restriction!.choices;
    }
    if (element.restriction!.attributes !== undefined) {
      result.attributes = element.restriction!.attributes;
    }

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

  private applyRestrictionFacets(target: XSDElement, source: XSDElement): void {
    const r = source.restriction!;
    if (r.enumeration) target.enumeration = r.enumeration;
    if (r.pattern !== undefined) target.pattern = r.pattern;
    if (r.minLength !== undefined) target.minLength = r.minLength;
    if (r.maxLength !== undefined) target.maxLength = r.maxLength;
    if (r.length !== undefined) target.length = r.length;
    if (r.minInclusive !== undefined) target.minInclusive = r.minInclusive;
    if (r.maxInclusive !== undefined) target.maxInclusive = r.maxInclusive;
    if (r.minExclusive !== undefined) target.minExclusive = r.minExclusive;
    if (r.maxExclusive !== undefined) target.maxExclusive = r.maxExclusive;
    if (r.totalDigits !== undefined) target.totalDigits = r.totalDigits;
    if (r.fractionDigits !== undefined) target.fractionDigits = r.fractionDigits;
    if (r.whiteSpace !== undefined) target.whiteSpace = r.whiteSpace;
  }
}
