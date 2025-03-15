import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { TypeReferenceResolver } from "@lib/xsd/resolvers/typeReferenceResolver";

describe('TypeReferenceResolver', () => {
  // Test resolution using a global types map.
  const baseSchema: XSDSchema = {
    elements: [
      {
        name: "SimpleType",
        children: [
          { name: "foo", type: "xsd:string" },
          { name: "bar", type: "xsd:string" }
        ]
      }
    ],
    types: {
      "SimpleType": {
        name: "SimpleType",
        children: [
          { name: "foo", type: "xsd:string" },
          { name: "bar", type: "xsd:string" }
        ]
      }
    }
  };

  it('should resolve children from a referenced type using the global types map', () => {
    const rootElement: XSDElement = {
      name: "root",
      type: "SimpleType"
    };

    const resolver = new TypeReferenceResolver(baseSchema);
    const resolved = resolver.execute(rootElement);

    expect(resolved.children).toBeDefined();
    expect(resolved.children).toHaveLength(2);
    expect(resolved.children).toEqual([
      { name: "foo", type: "xsd:string" },
      { name: "bar", type: "xsd:string" }
    ]);
  });

  it('should return element as is if type is not found', () => {
    const schema: XSDSchema = {
      elements: [],
      types: {}
    };

    const rootElement: XSDElement = {
      name: "root",
      type: "UnknownType"
    };

    const resolver = new TypeReferenceResolver(schema);
    const resolved = resolver.execute(rootElement);

    expect(resolved.children).toBeUndefined();
  });

  it('should return element as is if no type is specified', () => {
    const schema: XSDSchema = {
      elements: [],
      types: {}
    };

    const rootElement: XSDElement = {
      name: "root"
    };

    const resolver = new TypeReferenceResolver(schema);
    const resolved = resolver.execute(rootElement);

    expect(resolved.children).toBeUndefined();
  });

  it('should not overwrite existing children if type has no children', () => {
    const schema: XSDSchema = {
      elements: [],
      types: {
        "EmptyType": { name: "EmptyType" }
      }
    };

    const rootElement: XSDElement = {
      name: "root",
      type: "EmptyType",
      children: [{ name: "existing", type: "xsd:string" }]
    };

    const resolver = new TypeReferenceResolver(schema);
    const resolved = resolver.execute(rootElement);

    expect(resolved.children).toEqual([{ name: "existing", type: "xsd:string" }]);
  });

  it('should resolve colon-prefixed type names correctly using global types', () => {
    const schema: XSDSchema = {
      elements: [],
      types: {
        "SimpleType": {
          name: "SimpleType",
          children: [
            { name: "prefixedChild", type: "xsd:string" }
          ]
        }
      }
    };

    const element: XSDElement = {
      name: "root",
      type: "xsd:SimpleType"
    };

    const resolver = new TypeReferenceResolver(schema);
    const resolved = resolver.execute(element);

    expect(resolved.children).toEqual([
      { name: "prefixedChild", type: "xsd:string" }
    ]);
  });

  it('should recursively resolve nested type references using global types', () => {
    const schema: XSDSchema = {
      elements: [],
      types: {
        "TypeA": {
          name: "TypeA",
          children: [
            { name: "child1", type: "TypeB" }
          ]
        },
        "TypeB": {
          name: "TypeB",
          children: [
            { name: "grandchild", type: "xsd:string" }
          ]
        }
      }
    };

    const element: XSDElement = {
      name: "root",
      type: "TypeA"
    };

    const resolver = new TypeReferenceResolver(schema);
    const resolved = resolver.execute(element);

    expect(resolved.children).toEqual([
      {
        name: "child1",
        type: "TypeB",
        children: [
          { name: "grandchild", type: "xsd:string" }
        ]
      }
    ]);
  });

  it('should resolve choices from a referenced type using global types', () => {
    const schema: XSDSchema = {
      elements: [],
      types: {
        "ChoiceType": {
          name: "ChoiceType",
          choices: [
            { elements: [
                { name: "option1", type: "xsd:string" },
                { name: "option2", type: "xsd:string" }
              ]
            }
          ]
        }
      }
    };

    const element: XSDElement = {
      name: "root",
      type: "ChoiceType"
    };

    const resolver = new TypeReferenceResolver(schema);
    const resolved = resolver.execute(element);

    expect(resolved.choices).toEqual([
      { elements: [
          { name: "option1", type: "xsd:string" },
          { name: "option2", type: "xsd:string" }
        ]
      }
    ]);
  });

  it('should preserve existing choices if type has no choices', () => {
    const schema: XSDSchema = {
      elements: [],
      types: {
        "NoChoiceType": { name: "NoChoiceType" }
      }
    };

    const element: XSDElement = {
      name: "root",
      type: "NoChoiceType",
      choices: [
        { elements: [{ name: "existingChoice", type: "xsd:string" }] }
      ]
    };

    const resolver = new TypeReferenceResolver(schema);
    const resolved = resolver.execute(element);

    expect(resolved.choices).toEqual([
      { elements: [{ name: "existingChoice", type: "xsd:string" }] }
    ]);
  });

  it('should resolve both children and choices from a referenced type using global types', () => {
    const schema: XSDSchema = {
      elements: [],
      types: {
        "ComplexType": {
          name: "ComplexType",
          children: [
            { name: "child", type: "xsd:string" }
          ],
          choices: [
            { elements: [{ name: "option", type: "xsd:string" }] }
          ]
        }
      }
    };

    const element: XSDElement = {
      name: "root",
      type: "ComplexType",
      children: [{ name: "existingChild", type: "xsd:string" }],
      choices: [{ elements: [{ name: "existingOption", type: "xsd:string" }] }]
    };

    const resolver = new TypeReferenceResolver(schema);
    const resolved = resolver.execute(element);

    expect(resolved.children).toEqual([
      { name: "child", type: "xsd:string" }
    ]);
    expect(resolved.choices).toEqual([
      { elements: [{ name: "option", type: "xsd:string" }] }
    ]);
  });

  it('should handle nested elements with mixed resolutions using global types', () => {
    const schema: XSDSchema = {
      elements: [],
      types: {
        "ParentType": {
          name: "ParentType",
          children: [
            { name: "child1", type: "ChildType" }
          ]
        },
        "ChildType": {
          name: "ChildType",
          children: [
            { name: "grandchild", type: "xsd:string" }
          ]
        }
      }
    };

    const element: XSDElement = {
      name: "root",
      type: "ParentType",
      children: [{ name: "existingChild", type: "xsd:string" }]
    };

    const resolver = new TypeReferenceResolver(schema);
    const resolved = resolver.execute(element);

    expect(resolved.children).toEqual([
      {
        name: "child1",
        type: "ChildType",
        children: [
          { name: "grandchild", type: "xsd:string" }
        ]
      }
    ]);
  });
});
