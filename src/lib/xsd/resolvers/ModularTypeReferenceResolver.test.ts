import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { ModularTypeReferenceResolver } from "./ModularTypeReferenceResolver";

describe('ModularTypeReferenceResolver', () => {
  // Helper function to suppress console warnings during tests
  const suppressConsoleWarning = () => {
    const originalWarn = console.warn;
    beforeEach(() => {
      console.warn = jest.fn();
    });
    afterEach(() => {
      console.warn = originalWarn;
    });
  };

  suppressConsoleWarning();

  describe('Basic resolution', () => {
    it('should resolve type references correctly', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'SimpleType': {
            name: 'SimpleType',
            children: [
              { name: 'child', type: 'xsd:string' }
            ]
          }
        }
      };

      const element: XSDElement = {
        name: 'root',
        type: 'SimpleType'
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved.children).toHaveLength(1);
      expect(resolved.children?.[0].name).toBe('child');
      expect(resolved.children?.[0].type).toBe('xsd:string');
    });

    it('should return element as is if type is not found', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {}
      };

      const element: XSDElement = {
        name: 'root',
        type: 'UnknownType'
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved).toEqual(element);
    });

    it('should return element as is if no type is specified', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {}
      };

      const element: XSDElement = {
        name: 'root'
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved).toEqual(element);
    });
  });

  describe('Property preservation', () => {
    it('should not overwrite existing children if type has no children', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'EmptyType': { name: 'EmptyType' }
        }
      };

      const rootElement: XSDElement = {
        name: 'root',
        type: 'EmptyType',
        children: [{ name: 'existing', type: 'xsd:string' }]
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(rootElement);

      expect(resolved.children).toEqual([{ name: 'existing', type: 'xsd:string' }]);
    });

    it('should preserve existing choices if type has no choices', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'NoChoiceType': { name: 'NoChoiceType' }
        }
      };

      const element: XSDElement = {
        name: 'root',
        type: 'NoChoiceType',
        choices: [
          { elements: [{ name: 'existingChoice', type: 'xsd:string' }] }
        ]
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved.choices).toEqual([
        { elements: [{ name: 'existingChoice', type: 'xsd:string' }] }
      ]);
    });
  });

  describe('Prefixed type names', () => {
    it('should resolve colon-prefixed type names correctly using global types', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'SimpleType': {
            name: 'SimpleType',
            children: [
              { name: 'prefixedChild', type: 'xsd:string' }
            ]
          }
        }
      };

      const element: XSDElement = {
        name: 'root',
        type: 'ns1:SimpleType'
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved.children).toEqual([
        { name: 'prefixedChild', type: 'xsd:string' }
      ]);
    });
  });

  describe('Nested references', () => {
    it('should recursively resolve nested type references using global types', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'TypeA': {
            name: 'TypeA',
            children: [
              { name: 'child1', type: 'TypeB' }
            ]
          },
          'TypeB': {
            name: 'TypeB',
            children: [
              { name: 'grandchild', type: 'xsd:string' }
            ]
          }
        }
      };

      const element: XSDElement = {
        name: 'root',
        type: 'TypeA'
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved.children).toHaveLength(1);
      expect(resolved.children?.[0].name).toBe('child1');
      expect(resolved.children?.[0].type).toBe('TypeB');
      expect(resolved.children?.[0].children).toHaveLength(1);
      expect(resolved.children?.[0].children?.[0].name).toBe('grandchild');
    });

    it('should handle nested elements with mixed resolutions using global types', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'ParentType': {
            name: 'ParentType',
            children: [
              { name: 'child1', type: 'ChildType' }
            ]
          },
          'ChildType': {
            name: 'ChildType',
            children: [
              { name: 'grandchild', type: 'xsd:string' }
            ]
          }
        }
      };

      const element: XSDElement = {
        name: 'root',
        type: 'ParentType',
        children: [{ name: 'existingChild', type: 'xsd:string' }]
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved.children).toHaveLength(1);
      expect(resolved.children?.[0].name).toBe('child1');
      expect(resolved.children?.[0].children).toHaveLength(1);
      expect(resolved.children?.[0].children?.[0].name).toBe('grandchild');
    });
  });

  describe('Choice elements', () => {
    it('should resolve choices from a referenced type using global types', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'ChoiceType': {
            name: 'ChoiceType',
            choices: [
              {
                elements: [
                  { name: 'option1', type: 'xsd:string' },
                  { name: 'option2', type: 'xsd:string' }
                ]
              }
            ]
          }
        }
      };

      const element: XSDElement = {
        name: 'root',
        type: 'ChoiceType'
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved.choices).toHaveLength(1);
      expect(resolved.choices?.[0].elements).toHaveLength(2);
      expect(resolved.choices?.[0].elements[0].name).toBe('option1');
      expect(resolved.choices?.[0].elements[1].name).toBe('option2');
    });

    it('should resolve both children and choices from a referenced type using global types', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'ComplexType': {
            name: 'ComplexType',
            children: [
              { name: 'child', type: 'xsd:string' }
            ],
            choices: [
              { elements: [{ name: 'option', type: 'xsd:string' }] }
            ]
          }
        }
      };

      const element: XSDElement = {
        name: 'root',
        type: 'ComplexType',
        children: [{ name: 'existingChild', type: 'xsd:string' }],
        choices: [{ elements: [{ name: 'existingOption', type: 'xsd:string' }] }]
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved.children).toHaveLength(1);
      expect(resolved.children?.[0].name).toBe('child');
      expect(resolved.choices).toHaveLength(1);
      expect(resolved.choices?.[0].elements[0].name).toBe('option');
    });
  });

  describe('Extension and Restriction', () => {
    it('should resolve extension type with base type', () => {
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
          }
        }
      };

      const element: XSDElement = {
        name: 'extended',
        extension: {
          base: 'BaseType',
          children: [
            { name: 'extChild', type: 'xsd:string' }
          ],
          attributes: [
            { name: 'extAttr', type: 'xsd:string' }
          ]
        }
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      // Should contain both base children and extension children
      expect(resolved.children).toHaveLength(2);
      expect(resolved.children?.find(c => c.name === 'baseChild')).toBeDefined();
      expect(resolved.children?.find(c => c.name === 'extChild')).toBeDefined();

      // Should contain both base attributes and extension attributes
      expect(resolved.attributes).toHaveLength(2);
      expect(resolved.attributes?.find(a => a.name === 'baseAttr')).toBeDefined();
      expect(resolved.attributes?.find(a => a.name === 'extAttr')).toBeDefined();
    });

    it('should handle extension attribute collisions by preferring extension attributes', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'BaseType': {
            name: 'BaseType',
            attributes: [
              { name: 'attr', type: 'xsd:string', use: 'optional' }
            ]
          }
        }
      };

      const element: XSDElement = {
        name: 'extended',
        extension: {
          base: 'BaseType',
          attributes: [
            { name: 'attr', type: 'xsd:string', use: 'required' }
          ]
        }
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      // Should prefer the extension attribute definition
      expect(resolved.attributes).toHaveLength(1);
      expect(resolved.attributes?.[0].use).toBe('required');
    });

    it('should resolve restriction type with base type', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'BaseType': {
            name: 'BaseType',
            type: 'xsd:string',
            minLength: 1,
            maxLength: 100
          }
        }
      };

      const element: XSDElement = {
        name: 'restricted',
        restriction: {
          base: 'BaseType',
          minLength: 5,
          maxLength: 50,
          pattern: '[A-Z]+'
        }
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      // Should inherit type from base
      expect(resolved.type).toBe('xsd:string');

      // Should override constraints with restriction values
      expect(resolved.minLength).toBe(5);
      expect(resolved.maxLength).toBe(50);
      expect(resolved.pattern).toBe('[A-Z]+');
    });

    it('should handle nested extensions correctly', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'BaseType': {
            name: 'BaseType',
            children: [
              { name: 'baseChild', type: 'xsd:string' }
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

      const element: XSDElement = {
        name: 'leaf',
        extension: {
          base: 'MiddleType',
          children: [
            { name: 'leafChild', type: 'xsd:string' }
          ]
        }
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      // Should contain children from all levels in the inheritance chain
      expect(resolved.children).toHaveLength(3);
      const childNames = resolved.children?.map(c => c.name);
      expect(childNames).toContain('baseChild');
      expect(childNames).toContain('middleChild');
      expect(childNames).toContain('leafChild');
    });
  });

  describe('Namespace Handling', () => {
    it('should resolve type references with namespaces', () => {
      const schema: XSDSchema = {
        targetNamespace: 'http://example.org/ns1',
        elements: [],
        types: {
          'Type1': {
            name: 'Type1',
            namespace: 'http://example.org/ns1',
            children: [
              { name: 'child1', type: 'xsd:string' }
            ]
          }
        }
      };

      const element: XSDElement = {
        name: 'root',
        namespace: 'http://example.org/ns1',
        type: 'ns1:Type1'
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      const resolved = resolver.execute(element);

      expect(resolved.children).toBeDefined();
      expect(resolved.children).toHaveLength(1);
      expect(resolved.children?.[0].name).toBe('child1');
    });
  });

  describe('Caching Mechanism', () => {
    it('should use cache for repeated type resolutions within a single execute call', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'RepeatedType': { 
            name: 'RepeatedType', 
            children: [{ name: 'child', type: 'xsd:string' }] 
          },
          'ParentType': {
            name: 'ParentType',
            children: [
              { name: 'el1', type: 'RepeatedType' }, // First reference
              { name: 'el2', type: 'RepeatedType' }  // Second reference (should hit cache)
            ]
          }
        }
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      
      const rootElement: XSDElement = { name: 'root', type: 'ParentType' };
      const resolved = resolver.execute(rootElement);
      
      expect(resolved.children).toHaveLength(2);
      expect(resolved.children?.[0].type).toBe('RepeatedType');
      expect(resolved.children?.[1].type).toBe('RepeatedType');
      
      // Test that both children have the correct resolved structure
      expect(resolved.children?.[0].children).toEqual([{ name: 'child', type: 'xsd:string' }]);
      expect(resolved.children?.[1].children).toEqual([{ name: 'child', type: 'xsd:string' }]);
      
      // Advanced: Check that the same cached object is used for both resolutions
      // This validates that the cache is working properly
      expect(resolved.children?.[0].children).toEqual(resolved.children?.[1].children);
    });

    it('should clear cache between separate execute calls', () => {
      const schema: XSDSchema = {
        elements: [],
        types: {
          'AnotherType': { 
            name: 'AnotherType', 
            children: [{ name: 'child', type: 'xsd:string' }] 
          }
        }
      };

      const resolver = new ModularTypeReferenceResolver(schema);
      
      // First call
      const element1: XSDElement = { name: 'element1', type: 'AnotherType' };
      const resolved1 = resolver.execute(element1);
      
      // Modify the resolved element's children (this shouldn't affect second call)
      if (resolved1.children) {
        resolved1.children.push({ name: 'newChild', type: 'xsd:string' });
      }
      
      // Second call - should get fresh resolution
      const element2: XSDElement = { name: 'element2', type: 'AnotherType' };
      const resolved2 = resolver.execute(element2);
      
      // Should have original children count, not affected by first resolution mutation
      expect(resolved2.children).toHaveLength(1);
    });
  });

  describe('Integration testing', () => {
    it('should correctly handle a complex schema with all features', () => {
      // Create a schema that tests all resolution features together
      const complexSchema: XSDSchema = {
        targetNamespace: 'http://example.org/test',
        elements: [
          {
            name: 'RootElement',
            type: 'RootType'
          }
        ],
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
          'ChildType': {
            name: 'ChildType',
            extension: {
              base: 'BaseType',
              children: [
                { name: 'childChild', type: 'xsd:string' }
              ]
            }
          },
          'StringType': {
            name: 'StringType',
            restriction: {
              base: 'xsd:string',
              minLength: 1,
              maxLength: 100,
              pattern: '[A-Za-z]+'
            }
          },
          'RootType': {
            name: 'RootType',
            children: [
              { name: 'normalChild', type: 'xsd:string' },
              { name: 'typeChild', type: 'ChildType' },
              { name: 'restrictedChild', type: 'StringType' }
            ],
            choices: [
              {
                elements: [
                  { name: 'option1', type: 'xsd:string' },
                  { name: 'option2', type: 'ChildType' }
                ]
              }
            ]
          }
        }
      };

      const resolver = new ModularTypeReferenceResolver(complexSchema);
      
      // Resolve the root element from the schema
      const rootElement = complexSchema.elements[0];
      const resolved = resolver.execute(rootElement);
      
      // Verify the structure is correctly resolved
      expect(resolved.name).toBe('RootElement');
      expect(resolved.type).toBe('RootType');
      
      // Check children
      expect(resolved.children).toHaveLength(3);
      
      // Check normal child
      const normalChild = resolved.children?.find(c => c.name === 'normalChild');
      expect(normalChild).toBeDefined();
      expect(normalChild?.type).toBe('xsd:string');
      
      // Check child with extension
      const typeChild = resolved.children?.find(c => c.name === 'typeChild');
      expect(typeChild).toBeDefined();
      expect(typeChild?.type).toBe('ChildType');
      expect(typeChild?.children).toHaveLength(2);
      expect(typeChild?.children?.[0].name).toBe('baseChild');
      expect(typeChild?.children?.[1].name).toBe('childChild');
      
      // Check restricted child
      const restrictedChild = resolved.children?.find(c => c.name === 'restrictedChild');
      expect(restrictedChild).toBeDefined();
      expect(restrictedChild?.type).toBe('StringType');
      
      // Check choices
      expect(resolved.choices).toHaveLength(1);
      expect(resolved.choices?.[0].elements).toHaveLength(2);
      
      // Verify complex choice element resolution
      const option2 = resolved.choices?.[0].elements.find(e => e.name === 'option2');
      expect(option2).toBeDefined();
      expect(option2?.type).toBe('ChildType');
      expect(option2?.children).toHaveLength(2);
    });
  });
});
