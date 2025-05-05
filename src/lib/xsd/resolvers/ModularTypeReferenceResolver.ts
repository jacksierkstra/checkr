import { XSDSchema, XSDElement } from "@lib/types/xsd";
import { TypeRegistry } from "./modules/TypeRegistry";
import { ResolutionCache } from "./modules/ResolutionCache";
import { PropertyMerger } from "./modules/PropertyMerger";
import { TypeExtender } from "./modules/TypeExtender";
import { TypeRestrictor } from "./modules/TypeRestrictor";
import { TypeResolver } from "./modules/TypeResolver";
import { ElementResolver } from "./modules/ElementResolver";
import { 
  ITypeRegistry, 
  IResolutionCache, 
  IPropertyMerger,
  ITypeResolver,
  ITypeExtender,
  ITypeRestrictor,
  IElementResolver
} from "./modules/interfaces";

/**
 * A modular implementation of TypeReferenceResolver that uses composition
 * of specialized components while maintaining the same public API
 */
export class ModularTypeReferenceResolver implements IElementResolver {
  // Component instances
  private registry: ITypeRegistry;
  private cache: IResolutionCache;
  private merger: IPropertyMerger;
  private elementResolver: ElementResolver;
  private typeResolver: ITypeResolver;
  private typeExtender: ITypeExtender;
  private typeRestrictor: ITypeRestrictor;

  /**
   * Creates a new modular type reference resolver
   * @param schema The XSD schema
   */
  constructor(private schema: XSDSchema) {
    // Initialize components in dependency order
    this.registry = new TypeRegistry(schema);
    this.cache = new ResolutionCache(this.registry);
    this.merger = new PropertyMerger();
    
    // To handle circular dependencies, we need to create the element resolver with 
    // placeholder components that we'll assign properly after initialization
    this.elementResolver = new ElementResolver({} as any, {} as any, {} as any);
    
    // Now create the specialized components with access to the element resolver
    this.typeResolver = new TypeResolver(
      this.registry, 
      this.cache, 
      this.merger, 
      this.elementResolver
    );
    
    this.typeExtender = new TypeExtender(
      this.registry, 
      this.cache, 
      this.merger, 
      this.elementResolver
    );
    
    this.typeRestrictor = new TypeRestrictor(
      this.registry, 
      this.cache, 
      this.elementResolver
    );
    
    // Update the element resolver with the actual components
    Object.assign(this.elementResolver, new ElementResolver(
      this.typeResolver,
      this.typeExtender,
      this.typeRestrictor
    ));
  }

  /**
   * Resolves all top-level elements in the schema
   * Implements the original API from TypeReferenceResolver
   * @returns Array of resolved top-level elements
   */
  resolve(): XSDElement[] {
    this.cache.clear();
    return (this.schema.elements || []).map((element) => this.resolveElement(element));
  }

  /**
   * Resolves a single element provided by the caller
   * Implements the original API from TypeReferenceResolver
   * @param el The element to resolve
   * @returns The fully resolved element
   */
  execute(el: XSDElement): XSDElement {
    this.cache.clear();
    return this.resolveElement(el);
  }

  /**
   * Resolves a single element definition including all of its sub-components
   * Delegates to the element resolver component
   * @param element The element to resolve
   * @returns The fully resolved element
   */
  resolveElement(element: XSDElement): XSDElement {
    return this.elementResolver.resolveElement(element);
  }

  /**
   * Clears all internal caches
   * Exposed for testing purposes
   */
  clearCaches(): void {
    this.cache.clear();
  }
}
