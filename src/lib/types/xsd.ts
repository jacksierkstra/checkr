export interface XSDSchema {
  targetNamespace?: string;
  elementFormDefault?: "qualified" | "unqualified";
  attributeFormDefault?: "qualified" | "unqualified";
  blockDefault?: string;
  finalDefault?: string;
  elements: XSDElement[];
  types: { [typeName: string]: XSDElement }; // Global complexType definitions
  groups?: { [name: string]: XSDElement[] };
  attributeGroups?: { [name: string]: XSDAttribute[] };
}

export interface XSDElement {
  name: string;
  namespace?: string;
  type?: string;
  minOccurs?: number;
  maxOccurs?: number | "unbounded";
  attributes?: XSDAttribute[];
  children?: XSDElement[];
  form?: "qualified" | "unqualified";
  block?: string;
  final?: string;
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
  /** When set, this element is a placeholder for a globally declared group with this name */
  groupRef?: string;
  /** When set, this element is a member of the substitution group with this head element name */
  substitutionGroup?: string;
  /** Names of elements that may substitute this element (populated at resolution time) */
  allowedSubstitutes?: string[];
  /** Names of elements that are blocked from substituting this element */
  blockedSubstitutes?: string[];
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
  /** Marks a derivation that is blocked by block/final rules */
  derivationBlocked?: "extension" | "restriction" | "substitution";
  // Numeric constraints that can be applied directly to elements
  minInclusive?: number;
  maxInclusive?: number;
  minExclusive?: number;
  maxExclusive?: number;
  totalDigits?: number;
  fractionDigits?: number;
  identityConstraints?: XSDIdentityConstraint[];
}

export interface XSDExtension {
  base: string;
  children?: XSDElement[];
  choices?: XSDChoice[];
  attributes?: XSDAttribute[];
}

export interface XSDRestriction {
  base: string;
  /** True when this restriction comes from xs:simpleContent — attributes are inherited from base */
  simpleContent?: boolean;
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
  form?: "qualified" | "unqualified";
  use?: "required" | "optional" | "prohibited";
  fixed?: string;
  default?: string;
  /** When set, this attribute is a placeholder for a globally declared attribute with this name */
  ref?: string;
  /** When set, this attribute is a placeholder for a globally declared attributeGroup with this name */
  attributeGroupRef?: string;
  enumeration?: string[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  length?: number;
}

export interface XSDIdentityConstraint {
  kind: "key" | "unique" | "keyref";
  name: string;
  refer?: string;
  selector: string;
  fields: string[];
}

export interface XSDChoice {
  elements: XSDElement[];
  minOccurs?: number;
  maxOccurs?: number | "unbounded";
}
