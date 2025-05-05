import { XSDElement } from "@lib/types/xsd";
import { 
  ITypeExtender, 
  ITypeRegistry, 
  IResolutionCache, 
  IPropertyMerger,
  IElementResolver
} from "./interfaces";

/**
 * Handles resolution of type extensions
 */
export class TypeExtender implements ITypeExtender {
  /**
   * Creates a new type extender
   * @param registry The type registry for type lookups
   * @param cache The resolution cache 
   * @param merger The property merger
   * @param elementResolver The element resolver for nested resolution
   */
  constructor(
    private registry: ITypeRegistry,
    private cache: IResolutionCache,
    private merger: IPropertyMerger,
    private elementResolver: IElementResolver
  ) {}

  /**
   * Resolves an element with an extension definition
   * @param element The element with an extension to process
   * @returns The element with extension resolved
   */
  resolveExtension(element: XSDElement): XSDElement {
    if (!element.extension) {
      return element;
    }

    // Get base type information
    const baseTypeName = element.extension.base;
    const baseTypeDef = this.registry.getTypeDefinition(baseTypeName);

    if (!baseTypeDef) {
      // Base type not found, merge extension's direct content only
      return {
        ...element,
        children: [...(element.children || []), ...(element.extension.children || [])],
        choices: [...(element.choices || []), ...(element.extension.choices || [])],
        attributes: this.merger.mergeAttributes(element.attributes, element.extension.attributes),
        extension: undefined, // Clear the extension flag
      };
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

    // Merge: Start with base properties, add extension properties
    return {
      ...resolvedBaseElement,
      name: element.name,
      namespace: element.namespace,
      children: [
        ...(resolvedBaseElement.children || []),
        ...(element.extension.children || [])
      ],
      choices: [
        ...(resolvedBaseElement.choices || []),
        ...(element.extension.choices || [])
      ],
      attributes: this.merger.mergeAttributes(
        resolvedBaseElement.attributes, 
        element.extension.attributes
      ),
      minOccurs: element.minOccurs,
      maxOccurs: element.maxOccurs,
      extension: undefined, // Clear processing flags
      restriction: undefined,
      type: resolvedBaseElement.type,
      abstract: element.abstract !== undefined ? element.abstract : resolvedBaseElement.abstract,
    };
  }
}
