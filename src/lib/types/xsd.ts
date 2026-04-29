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
  length?: number;
  extension?: XSDExtension;
  restriction?: XSDRestriction;
  abstract?: boolean;
  mixed?: boolean;
  nillable?: boolean;
  listItemType?: string;
  unionMemberTypes?: string[];
  /** When set, this element is a placeholder for a globally declared element with this name */
  ref?: string;
  /** True when this element was declared inside xs:all (order-independent) */
  inAll?: boolean;
  /** True when the element's content model includes xs:any (wildcard child elements allowed) */
  allowAnyChild?: boolean;
  /** True when the element's schema includes xs:anyAttribute (wildcard attributes allowed) */
  allowAnyAttribute?: boolean;
  whiteSpace?: "preserve" | "replace" | "collapse";
  /** Default value for this element (used when element is absent) */
  default?: string;
  /** Fixed value constraint — element content must equal this if present */
  fixed?: string;
  // Numeric constraints that can be applied directly to elements
  minInclusive?: number;
  maxInclusive?: number;
  minExclusive?: number;
  maxExclusive?: number;
  totalDigits?: number;
  fractionDigits?: number;
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
  length?: number;
  minInclusive?: number;
  maxInclusive?: number;
  minExclusive?: number;
  maxExclusive?: number;
  totalDigits?: number;
  fractionDigits?: number;
  whiteSpace?: "preserve" | "replace" | "collapse";
  /** Children parsed from xs:complexContent > xs:restriction content model */
  children?: XSDElement[];
  /** Choices parsed from xs:complexContent > xs:restriction content model */
  choices?: XSDChoice[];
  /** Attributes declared inside xs:complexContent > xs:restriction */
  attributes?: XSDAttribute[];
}
export interface XSDAttribute {
  name: string;
  namespace?: string;
  type?: string;
  use?: "required" | "optional";
  fixed?: string;
  default?: string;
  /** When set, this attribute is a placeholder for a globally declared attribute with this name */
  ref?: string;
}

export interface XSDChoice {
  elements: XSDElement[];
  minOccurs?: number;
  maxOccurs?: number | "unbounded";
}
