import {
  XSDElement,
  XSDSchema,
  XSDAttribute,
  XSDExtension,
  XSDRestriction
} from "@lib/types/xsd";

/**
 * Interface for type registries that manage schema type definitions
 */
export interface ITypeRegistry {
  /**
   * Retrieves a type definition by its qualified name
   * @param typeName The qualified name of the type (may include prefix)
   * @param contextNamespace Optional namespace context for resolution
   * @returns The found type definition or undefined if not found
   */
  getTypeDefinition(typeName: string, contextNamespace?: string): XSDElement | undefined;
  
  /**
   * Parses a qualified name into its prefix and local parts
   * @param qname The qualified name to parse
   * @returns Object containing the prefix (if any) and local name
   */
  parseQName(qname: string): { prefix: string | undefined; localName: string };
  
  /**
   * Resolves a namespace prefix to its full URI
   * @param prefix The prefix to resolve
   * @returns The namespace URI or undefined if not found
   */
  resolveNamespacePrefix(prefix: string): string | undefined;
}

/**
 * Interface for caches that store resolved type definitions
 */
export interface IResolutionCache {
  /**
   * Retrieves a cached type definition
   * @param key The cache key
   * @returns The cached type definition or undefined if not in cache
   */
  get(key: string): XSDElement | undefined;
  
  /**
   * Stores a type definition in the cache
   * @param key The cache key
   * @param value The type definition to cache
   */
  set(key: string, value: XSDElement): void;
  
  /**
   * Clears all cached entries
   */
  clear(): void;
  
  /**
   * Generates a normalized cache key for a type reference
   * @param typeQName The type qualified name
   * @returns A normalized cache key
   */
  generateKey(typeQName: string): string;
}

/**
 * Interface for resolvers that process type references
 */
export interface ITypeResolver {
  /**
   * Resolves an element's type reference
   * @param element The element with a type reference to resolve
   * @returns The element with resolved type information
   */
  resolveTypeReference(element: XSDElement): XSDElement;
}

/**
 * Interface for extensions that handle type extension processing
 */
export interface ITypeExtender {
  /**
   * Resolves an element with an extension definition
   * @param element The element with an extension to process
   * @returns The element with extension resolved
   */
  resolveExtension(element: XSDElement): XSDElement;
}

/**
 * Interface for restrictors that handle type restriction processing
 */
export interface ITypeRestrictor {
  /**
   * Resolves an element with a restriction definition
   * @param element The element with a restriction to process
   * @returns The element with restriction resolved
   */
  resolveRestriction(element: XSDElement): XSDElement;
}

/**
 * Interface for property mergers that combine properties from multiple sources
 */
export interface IPropertyMerger {
  /**
   * Merges properties from a resolved type definition into an element
   * @param element The target element
   * @param typeDef The source type definition
   * @returns The element with merged properties
   */
  mergeTypeDefinition(element: XSDElement, typeDef: XSDElement): XSDElement;
  
  /**
   * Merges attribute collections with proper precedence
   * @param baseAttrs The base attributes
   * @param overridingAttrs The overriding attributes
   * @returns The merged attribute collection
   */
  mergeAttributes(baseAttrs?: XSDAttribute[], overridingAttrs?: XSDAttribute[]): XSDAttribute[] | undefined;
}

/**
 * Interface for complete element resolvers that can process all resolution aspects
 */
export interface IElementResolver {
  /**
   * Resolves a single element definition including all of its sub-components
   * @param element The element to resolve
   * @returns The fully resolved element
   */
  resolveElement(element: XSDElement): XSDElement;
  
  /**
   * Resolves all elements in a schema and returns the result
   * @returns Array of resolved top-level elements
   */
  resolve(): XSDElement[];
  
  /**
   * Resolves a single element provided by the caller
   * @param el The element to resolve
   * @returns The fully resolved element
   */
  execute(el: XSDElement): XSDElement;
}
