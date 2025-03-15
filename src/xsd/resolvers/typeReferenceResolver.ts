import { XSDElement, XSDSchema } from "@lib/types/xsd";

export class TypeReferenceResolver {
  constructor(private schema: XSDSchema) {}

  resolve(): XSDElement[] {
    return this.schema.elements.map((element) => this.resolveElement(element));
  }

  execute(el: XSDElement): XSDElement {
    return this.resolveElement(el);
  }

  private resolveElement(element: XSDElement): XSDElement {
    let resolvedElement = element;

    if (element.type) {
      const parts = element.type.split(":");
      const localTypeName = parts.length > 1 ? parts[1] : parts[0];

      // First try the global complex types.
      let typeDef: XSDElement | undefined = this.schema.types[localTypeName];

      // If not found, fall back to searching global elements.
      if (!typeDef) {
        typeDef = this.schema.elements.find(e => e.name === localTypeName && (element.namespace ? e.namespace === element.namespace : true));
      }

      if (typeDef) {
        resolvedElement = {
          ...element,
          children:
            typeDef.children && typeDef.children.length > 0
              ? typeDef.children
              : element.children,
          choices:
            typeDef.choices && typeDef.choices.length > 0
              ? typeDef.choices
              : element.choices,
        };
      }
    }

    if (resolvedElement.children && resolvedElement.children.length > 0) {
      resolvedElement = {
        ...resolvedElement,
        children: resolvedElement.children.map(child => this.resolveElement(child)),
      };
    }

    return resolvedElement;
  }
}
