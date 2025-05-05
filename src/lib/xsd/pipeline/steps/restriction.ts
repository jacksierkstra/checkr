import { XSDElement, XSDRestriction } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";
import { Element } from "@xmldom/xmldom";

export class ParseRestrictionsStep implements PipelineStep<Element, Partial<XSDElement>> {
    execute(el: Element): Partial<XSDElement> {
        // Check for restrictions in simpleType
        const simpleType = el.getElementsByTagName("xs:simpleType")[0];
        if (simpleType) {
            return this.parseSimpleTypeRestriction(simpleType);
        }
        
        // Check for complexType restrictions
        const complexType = el.getElementsByTagName("xs:complexType")[0];
        if (complexType) {
            const restriction = complexType.getElementsByTagName("xs:restriction")[0];
            if (restriction) {
                return this.parseComplexTypeRestriction(restriction);
            }
        }
        
        return {};
    }
    
    private parseSimpleTypeRestriction(simpleType: Element): Partial<XSDElement> {
        const restriction = simpleType.getElementsByTagName("xs:restriction")[0];
        if (!restriction) return {};

        const result: Partial<XSDElement> = {};
        const baseType = restriction.getAttribute("base");
        
        // Handle direct type assignment for built-in types
        if (baseType && baseType.startsWith("xs:")) {
            result.type = baseType;
        } else if (baseType) {
            // Handle user-defined type restriction
            const restrictionDef: XSDRestriction = {
                base: baseType
            };
            
            // Add restriction facets
            this.parseRestrictionFacets(restriction, restrictionDef);
            
            result.restriction = restrictionDef;
            return result;
        }

        // Parse facets for built-in type restrictions
        const restrictionFacets = this.parseBasicRestrictionFacets(restriction);
        return { ...result, ...restrictionFacets };
    }
    
    private parseComplexTypeRestriction(restriction: Element): Partial<XSDElement> {
        const baseType = restriction.getAttribute("base");
        if (!baseType) return {};
        
        const restrictionDef: XSDRestriction = {
            base: baseType
        };
        
        // Complex restrictions can contain additional elements, attributes, etc.
        // Parse and add them to the restriction definition
        
        return {
            restriction: restrictionDef
        };
    }
    
    private parseBasicRestrictionFacets(restriction: Element): Partial<XSDElement> {
        const result: Partial<XSDElement> = {};
        
        const enumNodes = restriction.getElementsByTagName("xs:enumeration");
        const enumeration = Array.from(enumNodes).map(
            (enumNode) => enumNode.getAttribute("value") || ""
        );
        if (enumeration.length > 0) {
            result.enumeration = enumeration;
        }

        const patternEl = restriction.getElementsByTagName("xs:pattern")[0];
        if (patternEl) {
            const regex = patternEl.getAttribute("value");
            if (regex) {
                result.pattern = regex;
            }
        }

        const minLenEl = restriction.getElementsByTagName("xs:minLength")[0];
        if (minLenEl) {
            const val = parseInt(minLenEl.getAttribute("value") || "", 10);
            if (!isNaN(val)) {
                result.minLength = val;
            }
        }

        const maxLenEl = restriction.getElementsByTagName("xs:maxLength")[0];
        if (maxLenEl) {
            const val = parseInt(maxLenEl.getAttribute("value") || "", 10);
            if (!isNaN(val)) {
                result.maxLength = val;
            }
        }
        
        // Add numeric constraints
        this.parseNumericConstraints(restriction, result);
        
        return result;
    }
    
    private parseRestrictionFacets(restriction: Element, restrictionDef: XSDRestriction): void {
        // Add enumeration facets
        const enumNodes = restriction.getElementsByTagName("xs:enumeration");
        if (enumNodes.length > 0) {
            restrictionDef.enumeration = Array.from(enumNodes).map(
                (enumNode) => enumNode.getAttribute("value") || ""
            );
        }
        
        // Add pattern facet
        const patternEl = restriction.getElementsByTagName("xs:pattern")[0];
        if (patternEl) {
            const regex = patternEl.getAttribute("value");
            if (regex) {
                restrictionDef.pattern = regex;
            }
        }
        
        // Add length facets
        const minLenEl = restriction.getElementsByTagName("xs:minLength")[0];
        if (minLenEl) {
            const val = parseInt(minLenEl.getAttribute("value") || "", 10);
            if (!isNaN(val)) {
                restrictionDef.minLength = val;
            }
        }
        
        const maxLenEl = restriction.getElementsByTagName("xs:maxLength")[0];
        if (maxLenEl) {
            const val = parseInt(maxLenEl.getAttribute("value") || "", 10);
            if (!isNaN(val)) {
                restrictionDef.maxLength = val;
            }
        }
        
        // Add numeric constraints
        this.parseNumericRestrictionConstraints(restriction, restrictionDef);
    }
    
    private parseNumericConstraints(restriction: Element, result: Partial<XSDElement>): void {
        // No direct numeric constraints on XSDElement yet
        // This would need to be added to the XSDElement interface if needed
    }
    
    private parseNumericRestrictionConstraints(restriction: Element, restrictionDef: XSDRestriction): void {
        // minInclusive
        const minInclusiveEl = restriction.getElementsByTagName("xs:minInclusive")[0];
        if (minInclusiveEl) {
            const val = parseFloat(minInclusiveEl.getAttribute("value") || "");
            if (!isNaN(val)) {
                restrictionDef.minInclusive = val;
            }
        }
        
        // maxInclusive
        const maxInclusiveEl = restriction.getElementsByTagName("xs:maxInclusive")[0];
        if (maxInclusiveEl) {
            const val = parseFloat(maxInclusiveEl.getAttribute("value") || "");
            if (!isNaN(val)) {
                restrictionDef.maxInclusive = val;
            }
        }
        
        // minExclusive
        const minExclusiveEl = restriction.getElementsByTagName("xs:minExclusive")[0];
        if (minExclusiveEl) {
            const val = parseFloat(minExclusiveEl.getAttribute("value") || "");
            if (!isNaN(val)) {
                restrictionDef.minExclusive = val;
            }
        }
        
        // maxExclusive
        const maxExclusiveEl = restriction.getElementsByTagName("xs:maxExclusive")[0];
        if (maxExclusiveEl) {
            const val = parseFloat(maxExclusiveEl.getAttribute("value") || "");
            if (!isNaN(val)) {
                restrictionDef.maxExclusive = val;
            }
        }
    }
}
