/**
 * Well-known XML/XSD namespace URIs, per the XSD 1.0 spec and the
 * Namespaces in XML recommendation.
 */
export const NAMESPACE_XSD = "http://www.w3.org/2001/XMLSchema";
export const NAMESPACE_XSI = "http://www.w3.org/2001/XMLSchema-instance";
export const NAMESPACE_XML = "http://www.w3.org/XML/1998/namespace";
export const NAMESPACE_XMLNS = "http://www.w3.org/2000/xmlns/";

/**
 * Map key under which a namespace is stored in `CompiledSchema.grammars`.
 * The XSD spec models the absence of a namespace as a name (the "no
 * namespace" name), so `null` and `""` both key the null-namespace grammar.
 */
export function namespaceKey(namespaceURI: string | null): string {
    return namespaceURI ?? "";
}