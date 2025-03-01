export interface XSDSchema {
    targetNamespace?: string;
    elements: XSDElement[];
}

export interface XSDElement {
    name: string;
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
}
export interface XSDAttribute {
    name: string;
    type?: string;
    use?: 'required' | 'optional';
    fixed?: string;
}

export interface XSDChoice {
    elements: XSDElement[];
    minOccurs?: number;
    maxOccurs?: number | "unbounded";
}
