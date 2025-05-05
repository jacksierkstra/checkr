import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { TypeResolver } from "./TypeResolver";
import { TypeRegistry } from "./TypeRegistry";
import { ResolutionCache } from "./ResolutionCache";
import { PropertyMerger } from "./PropertyMerger";
import { IElementResolver } from "./interfaces";

// Create a mock ElementResolver for testing
class MockElementResolver implements IElementResolver {
  resolveCallCount = 0;
  resolveElementCallCount = 0;
  executeCallCount = 0;
  
  constructor(private responseFn: (element: XSDElement) => XSDElement = (e) => e) {}
  
  resolve(): XSDElement[] {
    this.resolveCallCount++;
    return [];
  }
  
  execute(el: XSDElement): XSDElement {
    this.executeCallCount++;
    return this.resolveElement(el);
  }
  
  resolveElement(element: XSDElement): XSDElement {
    this.resolveElementCallCount++;
    return this.responseFn(element);
  }
}

describe('TypeResolver', () => {
  // Test schema with some type definitions
  const schema: XSDSchema = {
    elements: [],
    types: {
      'SimpleType': {
        name: 'SimpleType',
        children: [
          { name: 'child', type: 'xsd:string' }
        ]
      },
      'NestedType': {
        name: 'NestedType',
        children: [
          { name: 'nested', type: 'SimpleType' }
        ]
      }
    }
  };
  
  const registry = new TypeRegistry(schema);
  const cache = new ResolutionCache(registry);
  const merger = new PropertyMerger();
  
  describe('resolveTypeReference', () => {
    it('should return the element as is if it has no type', () => {
      const mockResolver = new MockElementResolver();
      const resolver = new TypeResolver(registry, cache, merger, mockResolver);
      
      const element: XSDElement = { name: 'NoType' };
      const resolved = resolver.resolveTypeReference(element);
      
      expect(resolved).toBe(element);
      expect(mockResolver.resolveElementCallCount).toBe(0);
    });

    it('should return the element as is for built-in xsd types', () => {
      const mockResolver = new MockElementResolver();
      const resolver = new TypeResolver(registry, cache, merger, mockResolver);
      
      const element: XSDElement = { name: 'WithXsdType', type: 'xsd:string' };
      const resolved = resolver.resolveTypeReference(element);
      
      expect(resolved).toBe(element);
      expect(mockResolver.resolveElementCallCount).toBe(0);
    });

    it('should resolve a simple type reference', () => {
      const mockResolver = new MockElementResolver();
      const resolver = new TypeResolver(registry, cache, merger, mockResolver);
      
      const element: XSDElement = { name: 'WithType', type: 'SimpleType' };
      const resolved = resolver.resolveTypeReference(element);
      
      expect(mockResolver.resolveElementCallCount).toBe(1);
      expect(resolved.children).toHaveLength(1);
      expect(resolved.children?.[0].name).toBe('child');
    });

    it('should return the element as is if the type is not found', () => {
      const mockResolver = new MockElementResolver();
      const resolver = new TypeResolver(registry, cache, merger, mockResolver);
      
      const element: XSDElement = { name: 'WithUnknownType', type: 'UnknownType' };
      const resolved = resolver.resolveTypeReference(element);
      
      expect(resolved).toBe(element);
      expect(mockResolver.resolveElementCallCount).toBe(0);
    });

    it('should use the cache for repeated type resolutions', () => {
      const mockResolver = new MockElementResolver();
      const resolver = new TypeResolver(registry, cache, merger, mockResolver);
      
      // Clear the cache first
      cache.clear();
      
      // First resolution should use the element resolver
      const element1: XSDElement = { name: 'First', type: 'SimpleType' };
      resolver.resolveTypeReference(element1);
      
      // Second resolution should use the cache
      const element2: XSDElement = { name: 'Second', type: 'SimpleType' };
      resolver.resolveTypeReference(element2);
      
      // The element resolver should have been called only once for the first resolution
      expect(mockResolver.resolveElementCallCount).toBe(1);
    });

    it('should handle prefixed type names correctly', () => {
      const mockResolver = new MockElementResolver();
      const resolver = new TypeResolver(registry, cache, merger, mockResolver);
      
      // Clear the cache first
      cache.clear();
      
      const element: XSDElement = { name: 'WithPrefixedType', type: 'prefix:SimpleType' };
      const resolved = resolver.resolveTypeReference(element);
      
      expect(mockResolver.resolveElementCallCount).toBe(1);
      expect(resolved.children).toHaveLength(1);
      expect(resolved.children?.[0].name).toBe('child');
    });

    it('should store intermediate result in cache to handle circular references', () => {
      // Create a resolver that tracks when it's called with specific types
      const mockResolver = new MockElementResolver((element) => {
        // Simulate full resolution - add a marker to show it's been processed
        if (element.name === 'SimpleType') {
          return {
            ...element,
            children: [{ name: 'resolved', type: 'xsd:string' }]
          };
        }
        return element;
      });
      
      const resolver = new TypeResolver(registry, cache, merger, mockResolver);
      
      // Clear the cache first
      cache.clear();
      
      const element: XSDElement = { name: 'TestElement', type: 'SimpleType' };
      const resolved = resolver.resolveTypeReference(element);
      
      expect(resolved.children?.[0].name).toBe('resolved');
      expect(mockResolver.resolveElementCallCount).toBe(1);
      
      // Check that the cache was updated with the resolved definition
      const cachedDef = cache.get('SimpleType');
      expect(cachedDef).toBeDefined();
      expect(cachedDef?.children?.[0].name).toBe('resolved');
    });
  });
});
