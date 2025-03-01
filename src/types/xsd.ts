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
}

export interface XSDAttribute {
    name: string;
    type?: string;
    use?: 'required' | 'optional';
    fixed?: string;
}
