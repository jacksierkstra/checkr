export interface XSDSchema {
    targetNamespace: string;
    elements: XSDElement[];
    attributes: XSDAttribute[];
    complexTypes: XSDComplexType[];
    simpleTypes: XSDSimpleType[];
    // Add other relevant XSD elements
}

export interface XSDElement {
    name: string;
    type: string; // Qualified name (e.g., xs:string, tns:MyComplexType)
    minOccurs?: number;
    maxOccurs?: number | "unbounded";
    // Add other relevant XSD attributes
}

export interface XSDAttribute {
    name: string;
    type: string;
    use?: string; // e.g., "required", "optional"
    // Add other relevant XSD attributes
}

export interface XSDComplexType {
    name: string;
    sequence?: XSDSequence;
    all?: XSDAll;
    choice?: XSDChoice;
    attributes?: XSDAttribute[];
    // Add other relevant XSD attributes
}

export interface XSDSimpleType {
    name: string;
    restriction?: XSDRestriction;
    // Add other relevant XSD simple type related properties.
}

export interface XSDRestriction {
    base: string;
    enumeration?: string[];
    pattern?: string;
    // Add other restriction related properties.
}

export interface XSDSequence {
    elements: XSDElement[];
}

export interface XSDAll {
    elements: XSDElement[];
}

export interface XSDChoice {
    elements: XSDElement[];
}