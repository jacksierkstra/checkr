import { XSDElement, XSDAttribute } from "@lib/types/xsd";
import { PropertyMerger } from "./PropertyMerger";

describe('PropertyMerger', () => {
  describe('mergeAttributes', () => {
    it('should merge attributes with overriding attributes taking precedence', () => {
      const merger = new PropertyMerger();
      
      const baseAttrs: XSDAttribute[] = [
        { name: 'attr1', type: 'xsd:string', use: 'optional' },
        { name: 'attr2', type: 'xsd:string' }
      ];
      
      const overridingAttrs: XSDAttribute[] = [
        { name: 'attr1', type: 'xsd:string', use: 'required' }, // Override existing
        { name: 'attr3', type: 'xsd:integer' }                  // Add new
      ];
      
      const merged = merger.mergeAttributes(baseAttrs, overridingAttrs);
      
      expect(merged).toBeDefined();
      expect(merged).toHaveLength(3);
      
      // Check that attr1 was overridden
      const attr1 = merged?.find(a => a.name === 'attr1');
      expect(attr1?.use).toBe('required');
      
      // Check that attr2 was preserved
      expect(merged?.find(a => a.name === 'attr2')).toBeDefined();
      
      // Check that attr3 was added
      expect(merged?.find(a => a.name === 'attr3')).toBeDefined();
    });

    it('should handle empty attribute arrays', () => {
      const merger = new PropertyMerger();
      
      const merged = merger.mergeAttributes([], []);
      
      expect(merged).toBeUndefined();
    });

    it('should handle undefined attribute arrays', () => {
      const merger = new PropertyMerger();
      
      const merged = merger.mergeAttributes(undefined, undefined);
      
      expect(merged).toBeUndefined();
    });

    it('should handle one undefined attribute array', () => {
      const merger = new PropertyMerger();
      
      const baseAttrs: XSDAttribute[] = [
        { name: 'attr1', type: 'xsd:string' }
      ];
      
      const merged1 = merger.mergeAttributes(baseAttrs, undefined);
      const merged2 = merger.mergeAttributes(undefined, baseAttrs);
      
      expect(merged1).toEqual(baseAttrs);
      expect(merged2).toEqual(baseAttrs);
    });
  });

  describe('mergeTypeDefinition', () => {
    it('should merge typeDef children into element when typeDef has children', () => {
      const merger = new PropertyMerger();
      
      const element: XSDElement = {
        name: 'TestElement',
        type: 'TestType',
        children: [{ name: 'originalChild', type: 'xsd:string' }]
      };
      
      const typeDef: XSDElement = {
        name: 'TestType',
        children: [{ name: 'typeChild', type: 'xsd:string' }]
      };
      
      const merged = merger.mergeTypeDefinition(element, typeDef);
      
      expect(merged.children).toEqual(typeDef.children);
    });

    it('should preserve element children when typeDef has no children', () => {
      const merger = new PropertyMerger();
      
      const element: XSDElement = {
        name: 'TestElement',
        type: 'TestType',
        children: [{ name: 'originalChild', type: 'xsd:string' }]
      };
      
      const typeDef: XSDElement = {
        name: 'TestType'
      };
      
      const merged = merger.mergeTypeDefinition(element, typeDef);
      
      expect(merged.children).toEqual(element.children);
    });

    it('should merge typeDef choices into element when typeDef has choices', () => {
      const merger = new PropertyMerger();
      
      const element: XSDElement = {
        name: 'TestElement',
        type: 'TestType',
        choices: [{ elements: [{ name: 'originalChoice', type: 'xsd:string' }] }]
      };
      
      const typeDef: XSDElement = {
        name: 'TestType',
        choices: [{ elements: [{ name: 'typeChoice', type: 'xsd:string' }] }]
      };
      
      const merged = merger.mergeTypeDefinition(element, typeDef);
      
      expect(merged.choices).toEqual(typeDef.choices);
    });

    it('should preserve element choices when typeDef has no choices', () => {
      const merger = new PropertyMerger();
      
      const element: XSDElement = {
        name: 'TestElement',
        type: 'TestType',
        choices: [{ elements: [{ name: 'originalChoice', type: 'xsd:string' }] }]
      };
      
      const typeDef: XSDElement = {
        name: 'TestType'
      };
      
      const merged = merger.mergeTypeDefinition(element, typeDef);
      
      expect(merged.choices).toEqual(element.choices);
    });

    it('should merge attributes correctly', () => {
      const merger = new PropertyMerger();
      
      const element: XSDElement = {
        name: 'TestElement',
        type: 'TestType',
        attributes: [{ name: 'elementAttr', type: 'xsd:string' }]
      };
      
      const typeDef: XSDElement = {
        name: 'TestType',
        attributes: [{ name: 'typeAttr', type: 'xsd:string' }]
      };
      
      // Spy on the mergeAttributes method
      const mergeAttributesSpy = jest.spyOn(merger, 'mergeAttributes');
      
      merger.mergeTypeDefinition(element, typeDef);
      
      expect(mergeAttributesSpy).toHaveBeenCalledWith(
        typeDef.attributes,
        element.attributes
      );
      
      mergeAttributesSpy.mockRestore();
    });

    it('should handle all facet properties with proper precedence', () => {
      const merger = new PropertyMerger();
      
      const element: XSDElement = {
        name: 'TestElement',
        type: 'TestType',
        minLength: 5,     // Element overrides
        maxLength: 10     // Element overrides
      };
      
      const typeDef: XSDElement = {
        name: 'TestType',
        minLength: 1,     // Should be overridden
        maxLength: 100,   // Should be overridden
        pattern: '[A-Z]+', // Should be preserved
        minInclusive: 0    // Should be preserved
      };
      
      const merged = merger.mergeTypeDefinition(element, typeDef);
      
      // Element values should take precedence
      expect(merged.minLength).toBe(5);
      expect(merged.maxLength).toBe(10);
      
      // TypeDef values should be preserved when not in element
      expect(merged.pattern).toBe('[A-Z]+');
      expect(merged.minInclusive).toBe(0);
    });

    it('should clear processing flags (extension and restriction)', () => {
      const merger = new PropertyMerger();
      
      const element: XSDElement = {
        name: 'TestElement',
        type: 'TestType',
        extension: { base: 'BaseType' }
      };
      
      const typeDef: XSDElement = {
        name: 'TestType',
        restriction: { base: 'BaseType' }
      };
      
      const merged = merger.mergeTypeDefinition(element, typeDef);
      
      expect(merged.extension).toBeUndefined();
      expect(merged.restriction).toBeUndefined();
    });
  });
});
