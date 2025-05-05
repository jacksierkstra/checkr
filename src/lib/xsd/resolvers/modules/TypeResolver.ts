import { XSDElement } from "@lib/types/xsd";
import { 
  ITypeResolver, 
  ITypeRegistry, 
  IResolutionCache, 
  IPropertyMerger,
  IElementResolver
} from "./interfaces";

/**
 * Resolves element type references to their definitions
 */
export class TypeResolver implements ITypeResolver {
  /**
   * Creates a new type resolver
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
   * Resolves an element's type reference
   * @param element The element with a type reference to resolve
   * @returns The element with resolved type information
   */
  resolveTypeReference(element: XSDElement): XSDElement {
    if (!element.type) {
      return element;
    }

    const typeQName = element.type;
    
    // Skip resolution for built-in types (like xsd:string)
    if (this.registry.parseQName(typeQName).prefix === 'xsd') {
      return element;
    }

    // Get a normalized cache key for this type
    const cacheKey = this.cache.generateKey(typeQName);

    // Check if we've already resolved this type
    const cachedDef = this.cache.get(cacheKey);
    if (cachedDef) {
      return this.merger.mergeTypeDefinition(element, cachedDef);
    }

    // Find the type definition in the registry
    const typeDef = this.registry.getTypeDefinition(typeQName);
    if (!typeDef) {
      return element; // Type not found, return element as is
    }

    // Store provisional entry in cache to handle circular references
    this.cache.set(cacheKey, { ...typeDef });

    // Fully resolve the type definition (including nested types)
    const resolvedTypeDef = this.elementResolver.resolveElement({ ...typeDef });
    
    // Update cache with fully resolved definition
    this.cache.set(cacheKey, resolvedTypeDef);

    // Merge the type definition properties into the element
    return this.merger.mergeTypeDefinition(element, resolvedTypeDef);
  }
}
