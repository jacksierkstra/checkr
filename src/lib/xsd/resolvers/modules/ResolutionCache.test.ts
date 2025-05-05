import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { ResolutionCache } from "./ResolutionCache";
import { TypeRegistry } from "./TypeRegistry";

describe('ResolutionCache', () => {
  // Create a mock type registry for testing
  const schema: XSDSchema = { elements: [], types: {} };
  const registry = new TypeRegistry(schema);
  
  describe('generateKey', () => {
    it('should generate a key using the local name for a prefixed type', () => {
      const cache = new ResolutionCache(registry);
      
      const key = cache.generateKey('xsd:string');
      
      expect(key).toBe('string');
    });

    it('should generate a key for a non-prefixed type', () => {
      const cache = new ResolutionCache(registry);
      
      const key = cache.generateKey('SimpleType');
      
      expect(key).toBe('SimpleType');
    });

    it('should normalize different prefixed references to the same type', () => {
      const cache = new ResolutionCache(registry);
      
      const key1 = cache.generateKey('xsd:SimpleType');
      const key2 = cache.generateKey('other:SimpleType');
      const key3 = cache.generateKey('SimpleType');
      
      expect(key1).toBe('SimpleType');
      expect(key2).toBe('SimpleType');
      expect(key3).toBe('SimpleType');
    });
  });

  describe('set and get operations', () => {
    it('should store and retrieve a value using the normalized key', () => {
      const cache = new ResolutionCache(registry);
      const element: XSDElement = { 
        name: 'TestType',
        children: [{ name: 'child', type: 'xsd:string' }]
      };
      
      cache.set('prefix:TestType', element);
      const retrieved = cache.get('prefix:TestType');
      
      expect(retrieved).toEqual(element);
    });

    it('should retrieve values using different prefixes with the same local name', () => {
      const cache = new ResolutionCache(registry);
      const element: XSDElement = { 
        name: 'TestType',
        children: [{ name: 'child', type: 'xsd:string' }]
      };
      
      cache.set('prefix1:TestType', element);
      
      // Should retrieve the same element using a different prefix
      const retrieved = cache.get('prefix2:TestType');
      
      expect(retrieved).toEqual(element);
    });

    it('should return undefined for non-existent keys', () => {
      const cache = new ResolutionCache(registry);
      
      const retrieved = cache.get('NonExistentType');
      
      expect(retrieved).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all cached values', () => {
      const cache = new ResolutionCache(registry);
      const element: XSDElement = { 
        name: 'TestType',
        children: [{ name: 'child', type: 'xsd:string' }]
      };
      
      cache.set('TestType1', element);
      cache.set('TestType2', element);
      
      // Verify values are in cache
      expect(cache.get('TestType1')).toBeDefined();
      expect(cache.get('TestType2')).toBeDefined();
      
      // Clear the cache
      cache.clear();
      
      // Verify values are gone
      expect(cache.get('TestType1')).toBeUndefined();
      expect(cache.get('TestType2')).toBeUndefined();
    });
  });
});
