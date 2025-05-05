import { XSDSchema, XSDElement } from "@lib/types/xsd";
import { ITypeRegistry } from "./interfaces";

/**
 * Registry that manages schema type definitions and namespace resolution
 */
export class TypeRegistry implements ITypeRegistry {
  private namespaceMap: Map<string, string> = new Map();

  /**
   * Creates a new type registry for a schema
   * @param schema The XSD schema
   */
  constructor(private schema: XSDSchema) {
    // Initialize namespace mappings
    if (schema.targetNamespace) {
      this.namespaceMap.set('', schema.targetNamespace);
    }
    // Future enhancement: Parse schema xmlns attributes for prefix mappings
  }

  /**
   * Retrieves a type definition by its qualified name
   * @param typeName The qualified name of the type (may include prefix)
   * @param contextNamespace Optional namespace context for resolution
   * @returns The found type definition or undefined if not found
   */
  getTypeDefinition(typeName: string, contextNamespace?: string): XSDElement | undefined {
    // Parse QName to handle prefixed types
    const { prefix, localName } = this.parseQName(typeName);

    // Skip built-in types (like xsd:string, xsd:integer, etc.)
    if (prefix === 'xsd') {
      return undefined;
    }

    // Look up the type in the schema's global types collection
    let typeDef = this.schema.types?.[localName];
    if (typeDef) {
      // Deep clone to prevent mutations affecting the original definition
      return JSON.parse(JSON.stringify(typeDef));
    }

    // If not found in types, try to find in global elements
    if (this.schema.elements) {
      const elementDef = this.schema.elements.find(e => e.name === localName);
      if (elementDef) {
        // Deep clone to prevent mutations
        return JSON.parse(JSON.stringify(elementDef));
      }
    }

    return undefined;
  }

  /**
   * Parses a qualified name into its prefix and local parts
   * @param qname The qualified name to parse
   * @returns Object containing the prefix (if any) and local name
   */
  parseQName(qname: string): { prefix: string | undefined; localName: string } {
    const parts = qname.split(':');
    if (parts.length === 2) {
      return { prefix: parts[0], localName: parts[1] };
    }
    return { prefix: undefined, localName: qname };
  }

  /**
   * Resolves a namespace prefix to its full URI
   * @param prefix The prefix to resolve
   * @returns The namespace URI or undefined if not found
   */
  resolveNamespacePrefix(prefix: string): string | undefined {
    if (prefix === 'xsd') {
      return 'http://www.w3.org/2001/XMLSchema';
    }
    return this.namespaceMap.get(prefix);
  }
}
