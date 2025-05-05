import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { TypeExtender } from "./TypeExtender";
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

describe('TypeExtender', () => {
  // Test schema with base types
  const schema: XSDSchema = {
    elements: [],
    types: {
      'BaseType': {
        name: 'BaseType',
        children: [
          { name: 'baseChild', type: 'xsd:string' }
        ],
        attributes: [
          { name: 'baseAttr', type: 'xsd:string' }
        ]
      },
      'MiddleType': {
        name: 'MiddleType',
        extension: {
          base: 'BaseType',
          children: [
            { name: 'middleChild', type: 'xsd:string' }
          ]
        }
      }
    }
  };
  
  const registry = new TypeRegistry(schema);
  const cache = new ResolutionCache(registry);
  const merger = new PropertyMerger();
  
  describe('resolveExtension', () => {
    it('should return the element as is if it has no extension', () => {
      const mockResolver = new MockElementResolver();
      const extender = new TypeExtender(registry, cache, merger, mockResolver);
      
      const element: XSDElement = { name: 'NoExtension' };
      const resolved = extender.resolveExtension(element);
      
      expect(resolved).toBe(element);
      expect(mockResolver.resolveElementCallCount).toBe(0);
    });

    it('should handle base type not found by merging direct extension content', () => {
      const mockResolver = new MockElementResolver();
      const extender = new TypeExtender(registry, cache, merger, mockResolver);
      
      const element: XSDElement = {
        name: 'WithExtension',
        extension: {
          base: 'NonExistentType',
          children: [
            { name: 'extensionChild', type: 'xsd:string' }
          ]
        }
      };
      
      const resolved = extender.resolveExtension(element);
      
      expect(mockResolver.resolveElementCallCount).toBe(0);
      expect(resolved.children).toHaveLength(1);
      expect(resolved.children?.[0].name).toBe('extensionChild');
      expect(resolved.extension).toBeUndefined(); // Extension flag should be cleared
    });

    it('should resolve a simple extension with a base type', () => {
      const mockResolver = new MockElementResolver((element) => {
        // Simulate resolving the base type
        if (element.name === 'BaseType') {
          return {
            ...element,
            children: [{ name: 'resolvedBaseChild', type: 'xsd:string' }]
          };
        }
        return element;
      });
      
      const extender = new TypeExtender(registry, cache, merger, mockResolver);
      
      // Clear the cache first
      cache.clear();
      
      const element: XSDElement = {
        name: 'WithExtension',
        extension: {
          base: 'BaseType',
          children: [
            { name: 'extensionChild', type: 'xsd:string' }
          ]
        }
      };
      
      const resolved = extender.resolveExtension(element);
      
      expect(mockResolver.resolveElementCallCount).toBe(1);
      expect(resolved.children).toHaveLength(2);
      expect(resolved.children?.[0].name).toBe('resolvedBaseChild');
      expect(resolved.children?.[1].name).toBe('extensionChild');
      expect(resolved.extension).toBeUndefined(); // Extension flag should be cleared
    });

    it('should merge attributes correctly', () => {
      const mockResolver = new MockElementResolver((element) => element);
      const extender = new TypeExtender(registry, cache, merger, mockResolver);
      
      // Spy on the mergeAttributes method
      const mergeAttributesSpy = jest.spyOn(merger, 'mergeAttributes');
      
      const element: XSDElement = {
        name: 'WithExtension',
        extension: {
          base: 'BaseType',
          attributes: [
            { name: 'extAttr', type: 'xsd:string' }
          ]
        }
      };
      
      extender.resolveExtension(element);
      
      // Verify that mergeAttributes was called
      expect(mergeAttributesSpy).toHaveBeenCalled();
      
      // Restore the original method
      mergeAttributesSpy.mockRestore();
    });

    it('should use the cache for previously resolved base types', () => {
      const mockResolver = new MockElementResolver();
      const extender = new TypeExtender(registry, cache, merger, mockResolver);
      
      // Clear the cache first
      cache.clear();
      
      // First extension - should resolve base type
      const element1: XSDElement = {
        name: 'First',
        extension: { base: 'BaseType' }
      };
      extender.resolveExtension(element1);
      
      // Second extension with same base - should use cache
      const element2: XSDElement = {
        name: 'Second',
        extension: { base: 'BaseType' }
      };
      extender.resolveExtension(element2);
      
      // The element resolver should have been called only once for the first resolution
      expect(mockResolver.resolveElementCallCount).toBe(1);
    });

    it('should handle nested extensions correctly', () => {
      // This mock will simulate resolving the middle type, which itself has an extension
      const mockResolver = new MockElementResolver((element) => {
        if (element.name === 'MiddleType') {
          return {
            ...element,
            // This is the resolved version of MiddleType with both its own and base type's children
            children: [
              { name: 'baseChild', type: 'xsd:string' },
              { name: 'middleChild', type: 'xsd:string' }
            ]
          };
        }
        return element;
      });
      
      const extender = new TypeExtender(registry, cache, merger, mockResolver);
      
      // Clear the cache first
      cache.clear();
      
      const element: XSDElement = {
        name: 'LeafType',
        extension: {
          base: 'MiddleType',
          children: [
            { name: 'leafChild', type: 'xsd:string' }
          ]
        }
      };
      
      const resolved = extender.resolveExtension(element);
      
      expect(mockResolver.resolveElementCallCount).toBe(1);
      expect(resolved.children).toHaveLength(3);
      expect(resolved.children?.[0].name).toBe('baseChild');
      expect(resolved.children?.[1].name).toBe('middleChild');
      expect(resolved.children?.[2].name).toBe('leafChild');
    });

    it('should preserve namespaces and other element properties', () => {
      const mockResolver = new MockElementResolver();
      const extender = new TypeExtender(registry, cache, merger, mockResolver);
      
      const element: XSDElement = {
        name: 'WithNamespace',
        namespace: 'http://example.org/ns',
        minOccurs: 0,
        maxOccurs: 'unbounded',
        extension: {
          base: 'BaseType'
        }
      };
      
      const resolved = extender.resolveExtension(element);
      
      expect(resolved.namespace).toBe('http://example.org/ns');
      expect(resolved.minOccurs).toBe(0);
      expect(resolved.maxOccurs).toBe('unbounded');
    });

    it('should preserve the type from the base type', () => {
      const mockResolver = new MockElementResolver((element) => {
        if (element.name === 'BaseType') {
          return {
            ...element,
            type: 'xsd:complexType' // Base type has a type
          };
        }
        return element;
      });
      
      const extender = new TypeExtender(registry, cache, merger, mockResolver);
      
      // Clear the cache first
      cache.clear();
      
      const element: XSDElement = {
        name: 'WithExtension',
        extension: { base: 'BaseType' }
      };
      
      const resolved = extender.resolveExtension(element);
      
      expect(resolved.type).toBe('xsd:complexType');
    });
  });
});
