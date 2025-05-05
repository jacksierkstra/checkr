import { XSDElement, XSDExtension } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";
import { Element } from "@xmldom/xmldom";
import { ParseNestedElementsStep } from "./nestedElement";
import { ParseAttributesStep } from "./attributes";

export class ParseExtensionStep implements PipelineStep<Element, Partial<XSDElement>> {
    private nestedElementParser: ParseNestedElementsStep;
    private attributeParser: ParseAttributesStep;
    private readonly XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

    constructor() {
        this.nestedElementParser = new ParseNestedElementsStep();
        this.attributeParser = new ParseAttributesStep();
    }

    execute(el: Element): Partial<XSDElement> {
        // Look for complex type with extension using namespace-aware methods
        let complexType = el.getElementsByTagNameNS(this.XSD_NAMESPACE, "complexType")[0] as Element;
        if (!complexType) {
            complexType = el.getElementsByTagName("xs:complexType")[0] as Element;
        }
        if (!complexType) return {};

        // Check for mixed content
        const mixed = complexType.getAttribute("mixed");
        const result: Partial<XSDElement> = {};
        if (mixed === "true") {
            result.mixed = true;
        }

        // Check for abstract attribute
        const abstract = el.getAttribute("abstract");
        if (abstract === "true") {
            result.abstract = true;
        }

        let content = complexType.getElementsByTagNameNS(this.XSD_NAMESPACE, "complexContent")[0] as Element;
        if (!content) {
            content = complexType.getElementsByTagName("xs:complexContent")[0] as Element;
        }
        if (!content) return result;

        let extension = content.getElementsByTagNameNS(this.XSD_NAMESPACE, "extension")[0] as Element;
        if (!extension) {
            extension = content.getElementsByTagName("xs:extension")[0] as Element;
        }
        if (!extension) return result;

        const base = extension.getAttribute("base");
        if (!base) return result;

        // Create extension definition
        const extensionDef: XSDExtension = {
            base: base
        };

        // Parse the content structure of the extension
        const contentResult = this.parseContentStructure(extension);
        if (contentResult.children && contentResult.children.length > 0) {
            extensionDef.children = contentResult.children;
        }
        if (contentResult.choices && contentResult.choices.length > 0) {
            extensionDef.choices = contentResult.choices;
        }

        // Parse attributes from the extension
        const attributesResult = this.attributeParser.execute(extension);
        if (attributesResult.attributes && attributesResult.attributes.length > 0) {
            extensionDef.attributes = attributesResult.attributes.map(attr => {
                const attribute = { ...attr };
                // Find the corresponding attribute element to get fixed/default values
                const attrElements = extension.getElementsByTagNameNS(this.XSD_NAMESPACE, "attribute");
                const matchingAttr = Array.from(attrElements).find(el => el.getAttribute("name") === attr.name);
                if (matchingAttr) {
                    const fixed = matchingAttr.getAttribute("fixed");
                    const defaultVal = matchingAttr.getAttribute("default");
                    if (fixed) attribute.fixed = fixed;
                    if (defaultVal) attribute.default = defaultVal;
                }
                return attribute;
            });
        }

        return {
            ...result,
            extension: extensionDef
        };
    }
    
    /**
     * Helper method to get the first child element with a specific local name,
     * supporting both namespace-aware and namespace-unaware scenarios.
     */
    private getFirstChildByTagName(parent: Element, localName: string): Element | null {
        // Try namespace-aware search first
        const nsElements = parent.getElementsByTagNameNS(this.XSD_NAMESPACE, localName);
        if (nsElements.length > 0) {
            return nsElements[0] as Element;
        }
        
        // Fall back to prefix-based search (for backward compatibility)
        const prefixElements = parent.getElementsByTagName(`xs:${localName}`);
        if (prefixElements.length > 0) {
            return prefixElements[0] as Element;
        }
        
        // Search for direct child elements by examining all children
        for (let i = 0; i < parent.childNodes.length; i++) {
            const child = parent.childNodes[i] as Element;
            if (child.nodeType === 1 && ( // Element node
                child.localName === localName || 
                child.tagName === localName || 
                child.tagName === `xs:${localName}`
            )) {
                return child;
            }
        }
        
        return null;
    }
    
    /**
     * Improved method to parse content structure including sequences and choices
     * This handles nested structures better than the standard nestedElementParser
     */
    private parseContentStructure(extension: Element): Partial<XSDElement> {
        const result: Partial<XSDElement> = {
            children: [],
            choices: []
        };

        // Process all direct children of the extension
        Array.from(extension.childNodes).forEach(node => {
            if (node.nodeType !== 1) return; // skip non-elements
            const child = node as Element;

            if (this.isXsdElement(child, "sequence") || child.tagName === "xs:sequence") {
                // For sequence, get all element children
                const elements = Array.from(child.childNodes)
                    .filter(n => n.nodeType === 1)
                    .map(n => n as Element)
                    .filter(el => this.isXsdElement(el, "element") || el.tagName === "xs:element")
                    .map(el => {
                        const typeAttr = el.getAttribute("type");
                        const maxOccursAttr = el.getAttribute("maxOccurs");
                        const maxOccurs = maxOccursAttr === "unbounded" ? "unbounded" as const : 
                            maxOccursAttr ? parseInt(maxOccursAttr, 10) : 1;
                        return {
                            name: el.getAttribute("name") || "",
                            type: typeAttr || undefined,
                            minOccurs: parseInt(el.getAttribute("minOccurs") || "1", 10),
                            maxOccurs
                        };
                    });
                result.children?.push(...elements);
            } else if (this.isXsdElement(child, "choice") || child.tagName === "xs:choice") {
                // For choice, get all element children and wrap them in a choice object
                const elements = Array.from(child.childNodes)
                    .filter(n => n.nodeType === 1)
                    .map(n => n as Element)
                    .filter(el => this.isXsdElement(el, "element") || el.tagName === "xs:element")
                    .map(el => {
                        const typeAttr = el.getAttribute("type");
                        const maxOccursAttr = el.getAttribute("maxOccurs");
                        const maxOccurs = maxOccursAttr === "unbounded" ? "unbounded" as const : 
                            maxOccursAttr ? parseInt(maxOccursAttr, 10) : 1;
                        return {
                            name: el.getAttribute("name") || "",
                            type: typeAttr || undefined,
                            minOccurs: 0, // In a choice, minOccurs defaults to 0
                            maxOccurs
                        };
                    });
                if (elements.length > 0) {
                    result.choices?.push({ elements });
                }
            } else if (this.isXsdElement(child, "all") || child.tagName === "xs:all") {
                // For all, get all element children
                const elements = Array.from(child.childNodes)
                    .filter(n => n.nodeType === 1)
                    .map(n => n as Element)
                    .filter(el => this.isXsdElement(el, "element") || el.tagName === "xs:element")
                    .map(el => {
                        const typeAttr = el.getAttribute("type");
                        const maxOccursAttr = el.getAttribute("maxOccurs");
                        const maxOccurs = maxOccursAttr === "unbounded" ? "unbounded" as const : 
                            maxOccursAttr ? parseInt(maxOccursAttr, 10) : 1;
                        return {
                            name: el.getAttribute("name") || "",
                            type: typeAttr || undefined,
                            minOccurs: parseInt(el.getAttribute("minOccurs") || "1", 10),
                            maxOccurs
                        };
                    });
                result.children?.push(...elements);
            }
        });

        return result;
    }

    private isXsdElement(el: Element, name: string): boolean {
        return el.localName === name && el.namespaceURI === this.XSD_NAMESPACE;
    }
}