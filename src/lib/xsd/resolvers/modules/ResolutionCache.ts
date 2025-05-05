import { XSDElement } from "@lib/types/xsd";
import { IResolutionCache, ITypeRegistry } from "./interfaces";

/**
 * Cache for storing resolved type definitions to prevent redundant resolution
 */
export class ResolutionCache implements IResolutionCache {
  private cache: { [key: string]: XSDElement } = {};

  /**
   * Creates a new resolution cache
   * @param registry The type registry for parsing QNames
   */
  constructor(private registry: ITypeRegistry) {}

  /**
   * Retrieves a cached type definition
   * @param key The cache key
   * @returns The cached type definition or undefined if not in cache
   */
  get(key: string): XSDElement | undefined {
    const normalizedKey = this.generateKey(key);
    return this.cache[normalizedKey];
  }

  /**
   * Stores a type definition in the cache
   * @param key The cache key
   * @param value The type definition to cache
   */
  set(key: string, value: XSDElement): void {
    const normalizedKey = this.generateKey(key);
    this.cache[normalizedKey] = value;
  }

  /**
   * Clears all cached entries
   */
  clear(): void {
    this.cache = {};
  }

  /**
   * Generates a normalized cache key for a type reference
   * @param typeQName The type qualified name
   * @returns A normalized cache key
   */
  generateKey(typeQName: string): string {
    // Use local name as the normalized key for consistent caching
    const { localName } = this.registry.parseQName(typeQName);
    return localName;
  }
}
