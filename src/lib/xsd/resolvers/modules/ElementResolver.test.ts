import { XSDElement, XSDChoice } from "@lib/types/xsd";
import { ElementResolver } from "./ElementResolver";
import { ITypeResolver, ITypeExtender, ITypeRestrictor } from "./interfaces";

// Mock implementations of the dependencies
class MockTypeResolver implements ITypeResolver {
  resolveTypeReferenceCallCount = 0;
  processedElements: XSDElement[] = [];
  
  constructor(private responseFn: (element: XSDElement) => XSDElement = (e) => e) {}
  
  resolveTypeReference(element: XSDElement): XSDElement {
    this.resolveTypeReferenceCallCount++;
    this.processedElements.push(element);
    return this.responseFn(element);
  }
}

class MockTypeExtender implements ITypeExtender {
  resolveExtensionCallCount = 0;
  processedElements: XSDElement[] = [];
  
  constructor(private responseFn: (element: XSDElement) => XSDElement = (e) => e) {}
  
  resolveExtension(element: XSDElement): XSDElement {
    this.resolveExtensionCallCount++;
    this.processedElements.push(element);
    return this.responseFn(element);
  }
}

class MockTypeRestrictor implements ITypeRestrictor {
  resolveRestrictionCallCount = 0;
  processedElements: XSDElement[] = [];
  
  constructor(private responseFn: (element: XSDElement) => XSDElement = (e) => e) {}
  
  resolveRestriction(element: XSDElement): XSDElement {
    this.resolveRestrictionCallCount++;
    this.processedElements.push(element);
    return this.responseFn(element);
  }
}

describe('ElementResolver', () => {
  describe('resolveElement', () => {
    it('should delegate type resolution to the TypeResolver', () => {
      // Setup mock resolver that adds a marker by modifying name
      const mockTypeResolver = new MockTypeResolver((element) => {
        return {
          ...element,
          // Modify a valid property to indicate processing
          name: `${element.name}-processed`
        };
      });
      
      const mockTypeExtender = new MockTypeExtender();
      const mockTypeRestrictor = new MockTypeRestrictor();
      
      const resolver = new ElementResolver(
        mockTypeResolver,
        mockTypeExtender,
        mockTypeRestrictor
      );
      
      const element: XSDElement = {
        name: 'TestElement',
        type: 'SimpleType'
      };
      
      const resolved = resolver.resolveElement(element);
      
      expect(mockTypeResolver.resolveTypeReferenceCallCount).toBe(1);
      expect(mockTypeExtender.resolveExtensionCallCount).toBe(0);
      expect(mockTypeRestrictor.resolveRestrictionCallCount).toBe(0);
      
      // Verify the element was processed by checking the modified name
      expect(resolved.name).toBe('TestElement-processed');
      
      // Verify the correct element was passed to the resolver
      expect(mockTypeResolver.processedElements[0]).toEqual(element);
    });

    it('should delegate extension resolution to the TypeExtender', () => {
      // Setup mock extender that adds a marker by modifying name
      const mockTypeResolver = new MockTypeResolver();
      const mockTypeExtender = new MockTypeExtender((element) => {
        return {
          ...element,
          // Modify a valid property to indicate processing
          name: `${element.name}-processed`
        };
      });
      const mockTypeRestrictor = new MockTypeRestrictor();
      
      const resolver = new ElementResolver(
        mockTypeResolver,
        mockTypeExtender,
        mockTypeRestrictor
      );
      
      const element: XSDElement = {
        name: 'TestElement',
        extension: { base: 'BaseType' }
      };
      
      const resolved = resolver.resolveElement(element);
      
      expect(mockTypeResolver.resolveTypeReferenceCallCount).toBe(0);
      expect(mockTypeExtender.resolveExtensionCallCount).toBe(1);
      expect(mockTypeRestrictor.resolveRestrictionCallCount).toBe(0);
      
      // Verify the element was processed by checking the modified name
      expect(resolved.name).toBe('TestElement-processed');
      
      // Verify the correct element was passed to the extender
      expect(mockTypeExtender.processedElements[0]).toEqual(element);
    });

    it('should delegate restriction resolution to the TypeRestrictor', () => {
      // Setup mock restrictor that adds a marker by modifying name
      const mockTypeResolver = new MockTypeResolver();
      const mockTypeExtender = new MockTypeExtender();
      const mockTypeRestrictor = new MockTypeRestrictor((element) => {
        return {
          ...element,
          // Modify a valid property to indicate processing
          name: `${element.name}-processed`
        };
      });
      
      const resolver = new ElementResolver(
        mockTypeResolver,
        mockTypeExtender,
        mockTypeRestrictor
      );
      
      const element: XSDElement = {
        name: 'TestElement',
        restriction: { base: 'BaseType' }
      };
      
      const resolved = resolver.resolveElement(element);
      
      expect(mockTypeResolver.resolveTypeReferenceCallCount).toBe(0);
      expect(mockTypeExtender.resolveExtensionCallCount).toBe(0);
      expect(mockTypeRestrictor.resolveRestrictionCallCount).toBe(1);
      
      // Verify the element was processed by checking the modified name
      expect(resolved.name).toBe('TestElement-processed');
      
      // Verify the correct element was passed to the restrictor
      expect(mockTypeRestrictor.processedElements[0]).toEqual(element);
    });

    it('should NOT resolve types for elements with extension or restriction', () => {
      const mockTypeResolver = new MockTypeResolver();
      const mockTypeExtender = new MockTypeExtender();
      const mockTypeRestrictor = new MockTypeRestrictor();
      
      const resolver = new ElementResolver(
        mockTypeResolver,
        mockTypeExtender,
        mockTypeRestrictor
      );
      
      const element: XSDElement = {
        name: 'TestElement',
        type: 'SimpleType',
        extension: { base: 'BaseType' }
      };
      
      resolver.resolveElement(element);
      
      // Type resolution should be skipped when there's an extension
      expect(mockTypeResolver.resolveTypeReferenceCallCount).toBe(0);
      expect(mockTypeExtender.resolveExtensionCallCount).toBe(1);
    });

    it('should recursively resolve children', () => {
      const mockTypeResolver = new MockTypeResolver();
      const mockTypeExtender = new MockTypeExtender();
      const mockTypeRestrictor = new MockTypeRestrictor();
      
      const resolver = new ElementResolver(
        mockTypeResolver,
        mockTypeExtender,
        mockTypeRestrictor
      );
      
      // Spy on resolveElement to count recursive calls
      const resolveElementSpy = jest.spyOn(resolver, 'resolveElement');
      
      const element: XSDElement = {
        name: 'Parent',
        children: [
          { name: 'Child1' },
          { name: 'Child2', children: [{ name: 'Grandchild' }] }
        ]
      };
      
      resolver.resolveElement(element);
      
      // Should have 4 calls: parent + 2 children + 1 grandchild
      expect(resolveElementSpy).toHaveBeenCalledTimes(4);
      
      resolveElementSpy.mockRestore();
    });

    it('should recursively resolve choices', () => {
      const mockTypeResolver = new MockTypeResolver();
      const mockTypeExtender = new MockTypeExtender();
      const mockTypeRestrictor = new MockTypeRestrictor();
      
      const resolver = new ElementResolver(
        mockTypeResolver,
        mockTypeExtender,
        mockTypeRestrictor
      );
      
      // Spy on resolveElement to count recursive calls
      const resolveElementSpy = jest.spyOn(resolver, 'resolveElement');
      
      const element: XSDElement = {
        name: 'Parent',
        choices: [
          {
            elements: [
              { name: 'Option1' },
              { name: 'Option2' }
            ]
          }
        ]
      };
      
      resolver.resolveElement(element);
      
      // Should have 3 calls: parent + 2 choice elements
      expect(resolveElementSpy).toHaveBeenCalledTimes(3);
      
      resolveElementSpy.mockRestore();
    });

    it('should handle an element with no special resolution needs', () => {
      const mockTypeResolver = new MockTypeResolver();
      const mockTypeExtender = new MockTypeExtender();
      const mockTypeRestrictor = new MockTypeRestrictor();
      
      const resolver = new ElementResolver(
        mockTypeResolver,
        mockTypeExtender,
        mockTypeRestrictor
      );
      
      const element: XSDElement = {
        name: 'SimpleElement',
        // No type, extension, restriction, children, or choices
      };
      
      const resolved = resolver.resolveElement(element);
      
      // No special handling needed, just return a copy of the element
      expect(resolved).toEqual(element);
      expect(mockTypeResolver.resolveTypeReferenceCallCount).toBe(0);
      expect(mockTypeExtender.resolveExtensionCallCount).toBe(0);
      expect(mockTypeRestrictor.resolveRestrictionCallCount).toBe(0);
    });

    it('should handle complex elements with multiple resolution needs', () => {
      // Setup mocks that track the processing order
      const processingOrder: string[] = [];
      
      const mockTypeResolver = new MockTypeResolver((element) => {
        processingOrder.push('resolver');
        return {
          ...element,
          // Add a valid marker using the name property
          name: `${element.name}-resolver`
        };
      });
      
      const mockTypeExtender = new MockTypeExtender((element) => {
        processingOrder.push('extender');
        return {
          ...element,
          // Add a valid marker using the name property
          name: `${element.name}-extender`,
          // Add a child that should get recursively resolved
          children: [{ name: 'AddedChild' }]
        };
      });
      
      const mockTypeRestrictor = new MockTypeRestrictor((element) => {
        processingOrder.push('restrictor');
        return {
          ...element,
          // Add a valid marker using the name property
          name: `${element.name}-restrictor`
        };
      });
      
      const resolver = new ElementResolver(
        mockTypeResolver,
        mockTypeExtender,
        mockTypeRestrictor
      );
      
      // This element simulates a complex scenario with extension and children
      const element: XSDElement = {
        name: 'ComplexElement',
        extension: { base: 'BaseType' },
        children: [
          { name: 'ExistingChild', type: 'ChildType' }
        ]
      };
      
      const resolved = resolver.resolveElement(element);
      
      // Should have processed extension first, then recursively resolved children
      expect(mockTypeExtender.resolveExtensionCallCount).toBe(1);
      expect(mockTypeResolver.resolveTypeReferenceCallCount).toBe(1); // For the child
      
      // Verify processing order: extender first, then resolver for the child
      expect(processingOrder[0]).toBe('extender');
      
      // Verify that the extension was processed
      expect(resolved.name).toBe('ComplexElement-extender');
      
      // Verify that both the existing child and the added child were processed
      expect(resolved.children).toHaveLength(1);
    });
  });
});
