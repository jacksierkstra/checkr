import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { TypeRestrictor } from "./TypeRestrictor";
import { TypeRegistry } from "./TypeRegistry";
import { ResolutionCache } from "./ResolutionCache";
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

describe("TypeRestrictor", () => {
  // Test schema with base types
  const schema: XSDSchema = {
    elements: [],
    types: {
      BaseType: {
        name: "BaseType",
        type: "xsd:string",
        minLength: 1,
        maxLength: 100,
        pattern: "[A-Za-z]*",
      },
      NumberType: {
        name: "NumberType",
        type: "xsd:integer",
        minInclusive: 0,
        maxInclusive: 100,
      },
    },
  };

  const registry = new TypeRegistry(schema);
  const cache = new ResolutionCache(registry);

  describe("resolveRestriction", () => {
    it("should return the element as is if it has no restriction", () => {
      const mockResolver = new MockElementResolver();
      const restrictor = new TypeRestrictor(registry, cache, mockResolver);

      const element: XSDElement = { name: "NoRestriction" };
      const resolved = restrictor.resolveRestriction(element);

      expect(resolved).toBe(element);
      expect(mockResolver.resolveElementCallCount).toBe(0);
    });

    it("should handle base type not found by applying restriction facets directly", () => {
      const mockResolver = new MockElementResolver();
      const restrictor = new TypeRestrictor(registry, cache, mockResolver);

      const element: XSDElement = {
        name: "WithRestriction",
        restriction: {
          base: "NonExistentType",
          minLength: 5,
          maxLength: 10,
          pattern: "[0-9]+",
        },
      };

      const resolved = restrictor.resolveRestriction(element);

      expect(mockResolver.resolveElementCallCount).toBe(0);
      expect(resolved.minLength).toBe(5);
      expect(resolved.maxLength).toBe(10);
      expect(resolved.pattern).toBe("[0-9]+");
      expect(resolved.restriction).toBeUndefined(); // Restriction flag should be cleared
    });

    it("should resolve a simple restriction with a base type", () => {
      const mockResolver = new MockElementResolver((element) => {
        // Simulate resolving the base type
        if (element.name === "BaseType") {
          return {
            ...element,
            type: "xsd:string",
            minLength: 1,
            maxLength: 100,
            pattern: "[A-Za-z]*",
          };
        }
        return element;
      });

      const restrictor = new TypeRestrictor(registry, cache, mockResolver);

      // Clear the cache first
      cache.clear();

      const element: XSDElement = {
        name: "WithRestriction",
        restriction: {
          base: "BaseType",
          minLength: 5,
          maxLength: 50,
          pattern: "[A-Z]+",
        },
      };

      const resolved = restrictor.resolveRestriction(element);

      expect(mockResolver.resolveElementCallCount).toBe(1);
      expect(resolved.type).toBe("xsd:string"); // Inherited from base
      expect(resolved.minLength).toBe(5); // Overridden
      expect(resolved.maxLength).toBe(50); // Overridden
      expect(resolved.pattern).toBe("[A-Z]+"); // Overridden
      expect(resolved.restriction).toBeUndefined(); // Restriction flag should be cleared
    });

    it("should use the cache for previously resolved base types", () => {
      const mockResolver = new MockElementResolver();
      const restrictor = new TypeRestrictor(registry, cache, mockResolver);

      // Clear the cache first
      cache.clear();

      // First restriction - should resolve base type
      const element1: XSDElement = {
        name: "First",
        restriction: { base: "BaseType" },
      };
      restrictor.resolveRestriction(element1);

      // Second restriction with same base - should use cache
      const element2: XSDElement = {
        name: "Second",
        restriction: { base: "BaseType" },
      };
      restrictor.resolveRestriction(element2);

      // The element resolver should have been called only once for the first resolution
      expect(mockResolver.resolveElementCallCount).toBe(1);
    });

    it("should handle all restriction facets correctly", () => {
      const mockResolver = new MockElementResolver();
      const restrictor = new TypeRestrictor(registry, cache, mockResolver);

      // Clear the cache first
      cache.clear();

      const element: XSDElement = {
        name: "WithAllFacets",
        restriction: {
          base: "NumberType",
          minInclusive: 10,
          maxInclusive: 50,
          minExclusive: 9,
          maxExclusive: 51,
          enumeration: ["10", "20", "30", "40", "50"],
        },
      };

      const resolved = restrictor.resolveRestriction(element);

      expect(resolved.minInclusive).toBe(10);
      expect(resolved.maxInclusive).toBe(50);
      expect(resolved.minExclusive).toBe(9);
      expect(resolved.maxExclusive).toBe(51);
      expect(resolved.enumeration).toEqual(["10", "20", "30", "40", "50"]);
    });

    it("should preserve namespaces and other element properties", () => {
      const mockResolver = new MockElementResolver();
      const restrictor = new TypeRestrictor(registry, cache, mockResolver);

      const element: XSDElement = {
        name: "WithNamespace",
        namespace: "http://example.org/ns",
        minOccurs: 0,
        maxOccurs: "unbounded",
        restriction: {
          base: "BaseType",
        },
      };

      const resolved = restrictor.resolveRestriction(element);

      expect(resolved.namespace).toBe("http://example.org/ns");
      expect(resolved.minOccurs).toBe(0);
      expect(resolved.maxOccurs).toBe("unbounded");
    });

    it("should use restriction children instead of base type children when restriction defines content model", () => {
      const mockResolver = new MockElementResolver((element) => {
        if (element.name === "BaseAddress") {
          return {
            ...element,
            children: [
              { name: "Street", type: "xs:string", minOccurs: 0, maxOccurs: 1 },
              { name: "City", type: "xs:string", minOccurs: 0, maxOccurs: 1 },
              { name: "Country", type: "xs:string", minOccurs: 0, maxOccurs: 1 },
            ],
          };
        }
        return element;
      });

      const schemaWithBase: XSDSchema = {
        elements: [],
        types: {
          BaseAddress: {
            name: "BaseAddress",
            children: [
              { name: "Street", type: "xs:string", minOccurs: 0, maxOccurs: 1 },
              { name: "City", type: "xs:string", minOccurs: 0, maxOccurs: 1 },
              { name: "Country", type: "xs:string", minOccurs: 0, maxOccurs: 1 },
            ],
          },
        },
      };
      const reg = new TypeRegistry(schemaWithBase);
      const cch = new ResolutionCache(reg);
      const restrictor = new TypeRestrictor(reg, cch, mockResolver);
      cch.clear();

      const element: XSDElement = {
        name: "RestrictedAddress",
        restriction: {
          base: "BaseAddress",
          children: [{ name: "Street", type: "xs:string", minOccurs: 1, maxOccurs: 1 }],
        },
      };

      const resolved = restrictor.resolveRestriction(element);

      expect(resolved.children).toHaveLength(1);
      expect(resolved.children![0].name).toBe("Street");
      expect(resolved.children![0].minOccurs).toBe(1);
    });

    it("should treat xs:anyType base as ur-type and apply restriction facets + content directly", () => {
      const mockResolver = new MockElementResolver();
      const restrictor = new TypeRestrictor(registry, cache, mockResolver);

      const element: XSDElement = {
        name: "RestrictedAny",
        restriction: {
          base: "xs:anyType",
          enumeration: ["A", "B"],
          children: [{ name: "Child", type: "xs:string", minOccurs: 1, maxOccurs: 1 }],
          attributes: [{ name: "id", type: "xs:string" }],
        },
      };

      const resolved = restrictor.resolveRestriction(element);

      // Should not try to resolve base type
      expect(mockResolver.resolveElementCallCount).toBe(0);
      // Facets applied
      expect(resolved.enumeration).toEqual(["A", "B"]);
      // Content model from restriction
      expect(resolved.children).toHaveLength(1);
      expect(resolved.children![0].name).toBe("Child");
      // Attributes from restriction
      expect(resolved.attributes).toHaveLength(1);
      expect(resolved.attributes![0].name).toBe("id");
      // Restriction cleared
      expect(resolved.restriction).toBeUndefined();
    });

    it("should inherit base attributes in simpleContent restriction (only override declared attrs)", () => {
      const mockResolver = new MockElementResolver((element) => {
        if (element.name === "MoneyBase") {
          return {
            ...element,
            type: "xs:integer",
            attributes: [
              { name: "currency", type: "xs:string", use: "required" },
              { name: "unit", type: "xs:string" },
            ],
          };
        }
        return element;
      });

      const schemaWithBase: XSDSchema = {
        elements: [],
        types: {
          MoneyBase: {
            name: "MoneyBase",
            type: "xs:integer",
            attributes: [
              { name: "currency", type: "xs:string", use: "required" },
              { name: "unit", type: "xs:string" },
            ],
          },
        },
      };
      const reg = new TypeRegistry(schemaWithBase);
      const cch = new ResolutionCache(reg);
      const restrictor = new TypeRestrictor(reg, cch, mockResolver);
      cch.clear();

      const element: XSDElement = {
        name: "RestrictedMoney",
        restriction: {
          base: "MoneyBase",
          simpleContent: true,
          maxInclusive: 1000,
          // Only restrict 'currency' to required; 'unit' should be inherited unchanged
          attributes: [{ name: "currency", type: "xs:string", use: "required" }],
        },
      };

      const resolved = restrictor.resolveRestriction(element);

      // Both attributes should be present: currency from restriction + unit inherited from base
      expect(resolved.attributes).toHaveLength(2);
      const names = resolved.attributes!.map((a) => a.name);
      expect(names).toContain("currency");
      expect(names).toContain("unit");
      // restriction's version of currency wins
      expect(resolved.attributes!.find((a) => a.name === "currency")?.use).toBe("required");
      expect(resolved.maxInclusive).toBe(1000);
    });

    it("should use restriction attributes instead of base type attributes", () => {
      const mockResolver = new MockElementResolver((element) => {
        if (element.name === "ItemBase") {
          return {
            ...element,
            attributes: [
              { name: "id", type: "xs:string" },
              { name: "obsolete", type: "xs:string" },
            ],
          };
        }
        return element;
      });

      const schemaWithBase: XSDSchema = {
        elements: [],
        types: {
          ItemBase: {
            name: "ItemBase",
            attributes: [
              { name: "id", type: "xs:string" },
              { name: "obsolete", type: "xs:string" },
            ],
          },
        },
      };
      const reg = new TypeRegistry(schemaWithBase);
      const cch = new ResolutionCache(reg);
      const restrictor = new TypeRestrictor(reg, cch, mockResolver);
      cch.clear();

      const element: XSDElement = {
        name: "RestrictedItem",
        restriction: {
          base: "ItemBase",
          attributes: [{ name: "id", type: "xs:string", use: "required" }],
        },
      };

      const resolved = restrictor.resolveRestriction(element);

      expect(resolved.attributes).toHaveLength(1);
      expect(resolved.attributes![0].name).toBe("id");
      expect(resolved.attributes![0].use).toBe("required");
    });
  });
});
