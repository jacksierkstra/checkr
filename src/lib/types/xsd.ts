export interface XSDSchema {
    targetNamespace?: string;
    elements: XSDElement[];
    types: { [typeName: string]: XSDElement }; // Global complexType definitions
}

export interface XSDElement {
    name: string;
    namespace?: string;
    type?: string;
    minOccurs?: number;
    maxOccurs?: number | "unbounded";
    attributes?: XSDAttribute[];
    children?: XSDElement[];
    enumeration?: string[];
    choices?: XSDChoice[];
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    extension?: XSDExtension;
    restriction?: XSDRestriction;
    abstract?: boolean;
    mixed?: boolean;
    // Numeric constraints that can be applied directly to elements
    minInclusive?: number;
    maxInclusive?: number;
    minExclusive?: number;
    maxExclusive?: number;
}

export interface XSDExtension {
    base: string;
    children?: XSDElement[];
    choices?: XSDChoice[];
    attributes?: XSDAttribute[];
}

export interface XSDRestriction {
    base: string;
    enumeration?: string[];
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    minInclusive?: number;
    maxInclusive?: number;
    minExclusive?: number;
    maxExclusive?: number;
}
export interface XSDAttribute {
    name: string;
    namespace?: string;
    type?: string;
    use?: 'required' | 'optional';
    fixed?: string;
    default?: string;
}

export interface XSDChoice {
    elements: XSDElement[];
    minOccurs?: number;
    maxOccurs?: number | "unbounded";
}
