# Checkr Type System Documentation

This document provides detailed information about the enhanced type system implemented in the Checkr XML validation library.

## Overview

The type system in Checkr supports rich type references, inheritance through extensions, and restrictions with facets. This allows for validating complex XML structures defined in XSD schemas.

## Type References

Type references allow elements to utilize type definitions from elsewhere in the schema. The type reference resolver handles:

- Simple type references (`type="xs:string"`)
- Complex type references (`type="CustomType"`)
- Namespaced type references (`type="ns1:CustomType"`)

### How Type Resolution Works

1. When an element has a `type` attribute, the resolver looks up the referenced type in:
   - The global types registry
   - The global elements registry (for element types)

2. When a match is found, the element is enriched with all properties from the type definition, such as:
   - Children elements
   - Attributes
   - Constraints (pattern, enumeration, etc.)
   - Choices

3. Type resolution happens recursively for nested elements as well

## Type Inheritance

### Extension (`xs:extension`)

Extensions allow types to inherit from base types and add new content. For example:

```xml
<xs:complexType name="EmployeeType">
  <xs:complexContent>
    <xs:extension base="PersonType">
      <xs:sequence>
        <xs:element name="employeeID" type="xs:string"/>
      </xs:sequence>
      <xs:attribute name="department" type="xs:string"/>
    </xs:extension>
  </xs:complexContent>
</xs:complexType>
```

In this example, `EmployeeType` inherits all properties from `PersonType` and adds an `employeeID` element and a `department` attribute.

#### Extension Resolution

When resolving extensions, Checkr:

1. Resolves the base type
2. Merges the base type's properties with the extending type's properties
3. Resolves further nested extensions recursively

### Restriction (`xs:restriction`)

Restrictions allow for creating new types by adding constraints to a base type. For example:

```xml
<xs:simpleType name="AgeType">
  <xs:restriction base="xs:integer">
    <xs:minInclusive value="0"/>
    <xs:maxInclusive value="120"/>
  </xs:restriction>
</xs:simpleType>
```

#### Supported Restriction Facets

- **String facets**:
  - `xs:pattern` - Regular expression pattern
  - `xs:enumeration` - List of allowed values
  - `xs:minLength` - Minimum string length
  - `xs:maxLength` - Maximum string length

- **Numeric facets**:
  - `xs:minInclusive` - Minimum value (inclusive)
  - `xs:maxInclusive` - Maximum value (inclusive)
  - `xs:minExclusive` - Minimum value (exclusive)
  - `xs:maxExclusive` - Maximum value (exclusive)

## Performance Optimization

The type reference resolver includes several optimizations:

1. **Caching** - Resolved types are cached to avoid redundant resolution
2. **Namespacing** - Efficient namespace resolution with minimal overhead
3. **Lazy Resolution** - Types are only resolved when needed during validation

## Error Handling

The type resolver provides detailed diagnostic information when types cannot be resolved:

- Clear warning messages when a type reference cannot be found
- Contextual information about where the reference occurred
- Fallback behavior to continue validation as much as possible

## Usage Example

```typescript
import { Checkr } from "@jacksierkstra/checkr";

// XSD with complex type inheritance
const xsd = `
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="person" type="PersonType"/>
  
  <xs:complexType name="PersonType">
    <xs:sequence>
      <xs:element name="name" type="xs:string"/>
      <xs:element name="age" type="AgeType"/>
    </xs:sequence>
  </xs:complexType>
  
  <xs:simpleType name="AgeType">
    <xs:restriction base="xs:integer">
      <xs:minInclusive value="0"/>
      <xs:maxInclusive value="120"/>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>
`;

const xml = `
<person>
  <name>John Doe</name>
  <age>35</age>
</person>
`;

const validator = new Checkr();
const validation = await validator.validate(xml, xsd);

console.log(validation.valid); // true
```

## Implementation Details

### TypeReferenceResolver

The core component of the type system is the `TypeReferenceResolver` class, which handles:

- Parsing qualified type names
- Resolving references within the schema
- Merging type definitions with element definitions
- Handling extension and restriction inheritance

### Pipeline Architecture

The type system is integrated into the validation pipeline architecture:

1. The XSD parser extracts global types and elements
2. The type resolver processes references and inheritance
3. The validator uses the resolved types for validation

## Known Limitations

- The current implementation does not yet support `xs:all` content model
- Complete support for substitution groups is still in development
- Circular type references may cause performance issues

## Future Enhancements

- Improved support for `xs:import` and `xs:include`
- Support for `xs:group` and `xs:attributeGroup`
- Enhanced reporting for type resolution issues
- Full support for abstract types and substitution groups