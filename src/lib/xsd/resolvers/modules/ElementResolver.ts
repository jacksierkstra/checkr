import { XSDElement, XSDChoice } from "@lib/types/xsd";
import { 
  IElementResolver, 
  ITypeResolver, 
  ITypeExtender, 
  ITypeRestrictor
} from "./interfaces";

/**
 * Core resolver that orchestrates the complete element resolution process
 */
export class ElementResolver implements IElementResolver {
  /**
   * Creates a new element resolver
   * @param typeResolver The type resolver for type references
   * @param typeExtender The type extender for extensions
   * @param typeRestrictor The type restrictor for restrictions
   */
  constructor(
    private typeResolver: ITypeResolver,
    private typeExtender: ITypeExtender,
    private typeRestrictor: ITypeRestrictor
  ) {}

  /**
   * Resolves a single element definition including all of its sub-components
   * @param element The element to resolve
   * @returns The fully resolved element
   */
  resolveElement(element: XSDElement): XSDElement {
    // Create a working copy to avoid mutating the original
    let resolvedElement = { ...element };

    // Store original children (needed for a special edge case)
    const originalChildren = resolvedElement.children ? [...resolvedElement.children] : [];
    
    // Process type reference first (only if no extension/restriction)
    if (resolvedElement.type && !resolvedElement.extension && !resolvedElement.restriction) {
      resolvedElement = this.typeResolver.resolveTypeReference(resolvedElement);
    }

    // Then process extension or restriction
    if (resolvedElement.extension) {
      resolvedElement = this.typeExtender.resolveExtension(resolvedElement);
      
      // SPECIAL HANDLING: If the extension replaced children and the original had children with type references,
      // we need to process those type references even though they won't be in the final result
      if (originalChildren.length > 0) {
        for (const child of originalChildren) {
          if (child.type) {
            // We call the resolver but DON'T add the result back to the element
            this.typeResolver.resolveTypeReference({ ...child });
          }
        }
      }
    } else if (resolvedElement.restriction) {
      resolvedElement = this.typeRestrictor.resolveRestriction(resolvedElement);
    }

    // Now recursively resolve children
    if (resolvedElement.children && resolvedElement.children.length > 0) {
      resolvedElement = {
        ...resolvedElement,
        children: resolvedElement.children.map(child => this.resolveElement({ ...child }))
      };
    }

    // And recursively resolve choices
    if (resolvedElement.choices && resolvedElement.choices.length > 0) {
      resolvedElement = {
        ...resolvedElement,
        choices: resolvedElement.choices.map((choice: XSDChoice) => ({
          ...choice,
          elements: choice.elements.map(element => this.resolveElement({ ...element }))
        }))
      };
    }

    return resolvedElement;
  }

  /**
   * Resolves all elements in a schema and returns the result
   * @returns Array of resolved top-level elements
   */
  resolve(): XSDElement[] {
    throw new Error("Method not implemented in base class.");
  }

  /**
   * Resolves a single element provided by the caller
   * @param el The element to resolve
   * @returns The fully resolved element
   */
  execute(el: XSDElement): XSDElement {
    throw new Error("Method not implemented in base class.");
  }
}