import { XSDSchema } from "@lib/types/xsd";
import { TypeRegistry } from "./TypeRegistry";

describe('TypeRegistry', () => {
  describe('parseQName', () => {
    it('should parse a qualified name with prefix', () => {
      const schema: XSDSchema = { elements: [], types: {} };
      const registry = new TypeRegistry(schema);
      
      const result = registry.parseQName('xsd:string');
      
      expect(result).toEqual({
        prefix: 'xsd',
        localName: 'string'
      });
    });

    it('should parse a local name without prefix', () => {
      const schema: XSDSchema = { elements: [], types: {} };
      const registry = new TypeRegistry(schema);
      
      const result = registry.parseQName('SimpleType');
      
      expect(result).toEqual({
        prefix: undefined,
        localName: 'SimpleType'
      });
    });
  });

  describe('resolveNamespacePrefix', () => {
    it('should resolve the xsd prefix to XML Schema namespace', () => {
      const schema: XSDSchema = { elements: [], types: {} };
      const registry = new TypeRegistry(schema);
      
      const result = registry.resolveNamespacePrefix('xsd');
      
      expect(result).toBe('http://www.w3.org/2001/XMLSchema');
    });

    it('should resolve a custom prefix using the namespace map', () => {
      const schema: XSDSchema = {
        targetNamespace: 'http://example.org/myns',
        elements: [],
        types: {}
      };
      const registry = new TypeRegistry(schema);
      
      // The empty string prefix maps to the target namespace
      const result = registry.resolveNamespacePrefix('');
      
      expect(result).toBe('http://example.org/myns');
    });

    it('should return undefined for an unknown prefix', () => {
      const schema: XSDSchema = { elements: [], types: {} };
      const registry = new TypeRegistry(schema);
      
      const result = registry.resolveNamespacePrefix('unknown');
      
      expect(result).toBeUndefined();
    });
  });

  describe('getTypeDefinition', () => {
    const schema: XSDSchema = {
      elements: [
        { name: 'GlobalElement', children: [{ name: 'child', type: 'xsd:string' }] }
      ],
      types: {
        'SimpleType': {
          name: 'SimpleType',
          children: [
            { name: 'child', type: 'xsd:string' }
          ]
        }
      }
    };

    it('should retrieve a type definition by local name', () => {
      const registry = new TypeRegistry(schema);
      
      const typeDef = registry.getTypeDefinition('SimpleType');
      
      expect(typeDef).toBeDefined();
      expect(typeDef?.name).toBe('SimpleType');
      expect(typeDef?.children).toHaveLength(1);
    });

    it('should retrieve a type definition by qualified name', () => {
      const registry = new TypeRegistry(schema);
      
      const typeDef = registry.getTypeDefinition('prefix:SimpleType');
      
      expect(typeDef).toBeDefined();
      expect(typeDef?.name).toBe('SimpleType');
    });

    it('should return undefined for built-in xsd types', () => {
      const registry = new TypeRegistry(schema);
      
      const typeDef = registry.getTypeDefinition('xsd:string');
      
      expect(typeDef).toBeUndefined();
    });

    it('should return undefined for unknown types', () => {
      const registry = new TypeRegistry(schema);
      
      const typeDef = registry.getTypeDefinition('NonExistentType');
      
      expect(typeDef).toBeUndefined();
    });

    it('should fall back to global elements if type not found', () => {
      const registry = new TypeRegistry(schema);
      
      const typeDef = registry.getTypeDefinition('GlobalElement');
      
      expect(typeDef).toBeDefined();
      expect(typeDef?.name).toBe('GlobalElement');
      expect(typeDef?.children).toHaveLength(1);
    });

    it('should return a deep copy to prevent mutation of original definitions', () => {
      const registry = new TypeRegistry(schema);
      
      const typeDef = registry.getTypeDefinition('SimpleType');
      
      expect(typeDef).not.toBe(schema.types['SimpleType']);
      
      // Modify the returned definition
      if (typeDef?.children) {
        typeDef.children.push({ name: 'newChild', type: 'xsd:string' });
      }
      
      // Original should remain unchanged
      expect(schema.types['SimpleType'].children).toHaveLength(1);
    });
  });
});
