# Reference XSD Validator Architectures

> Research findings for [CHK-003](../backlog/active/CHK-003-reference-architectures.md).
> Investigated against primary sources: Apache Xerces-J source code and documentation, libxml2 source code and documentation, W3C XML Schema specifications, and academic analysis of XSD processor architectures.

---

## 1. Xerces-J Architecture

Apache Xerces-J is the reference implementation for XSD 1.0 processing in Java. Its XSD processor has been stable since the 2003 timeframe and is the most mature open-source implementation available.

### Key Components

The architecture is organized around a **grammar-per-namespace** model:

| Component | Class | Role |
|-----------|-------|------|
| **Schema Grammar** | `SchemaGrammar` | Holds all schema components for a single namespace. Acts as a container / namespace-scoped symbol table. |
| **Element Declaration** | `XSElementDeclaration` | Represents an `xs:element` declaration — scope, type reference, substitution group affiliation, constraints. |
| **Type Definition** | `XSTypeDefinition` (interface) | Base for all type definitions. Subtypes: `XSSimpleTypeDefinition` (built-in + derived simple types) and `XSComplexTypeDefinition` (complex types). |
| **Simple Type** | `XSSimpleTypeDefinition` | Facets (length, minLength, pattern, enumeration, etc.), variety (atomic/list/union), base type. |
| **Complex Type** | `XSComplexTypeDefinition` | Content type (element-only, simple, mixed, empty), particle (model group), attribute uses, attribute wildcard, isAbstract. |
| **Model Group** | `XSModelGroupDefinition` | Named model groups (`xs:group`). Contains a particle tree of compositors (sequence, choice, all). |
| **Attribute Declaration** | `XSAttributeDeclaration` | Represents an `xs:attribute` declaration — type, scope, default/fixed. |
| **Attribute Group** | `XSAttributeGroupDefinition` | Named attribute groups (`xs:attributeGroup`). |
| **Identity Constraint** | `XSIdentityConstraintDefinition` | Represents `xs:key`, `xs:unique`, `xs:keyref` — selector, fields, referenced key. |
| **Wildcard** | `XSWildcard` | Represents `xs:any` and `xs:anyAttribute` — namespace constraint, process contents. |
| **Notation Declaration** | `XSNotationDeclaration` | Represents `xs:notation`. |
| **Annotation** | `XSAnnotation` | Schema annotation information (`xs:annotation`). |

### Schema Compilation

Xerces-J's schema compilation is driven by the `XSDHandler` class, which coordinates the multi-pass process:

1. **Parse**: `XSDDescription` → `XSDHandler.parseSchema()` reads XSD documents using a SAX parser, raising `XSDElementDecl`, `XSDComplexTypeDecl`, `XSDSimpleTypeDecl`, etc. as parse events.

2. **Include/Import/Redefine Resolution**: As each schema document is parsed, `xs:include`, `xs:import`, and `xs:redefine` directives are resolved recursively. The `XSDHandler` maintains a `fSchemaGrammarDescriptionRegistry` to track which schemas are already loaded and avoid circular includes.

3. **Component Assembly**: The `XSDElementDecl`, `XSComplexTypeDecl`, etc. classes are populated during parsing. For example:
   - `XSDElementDecl` stores: name, target namespace, type (as a reference), scope, substitution group affiliation, disallowed substitutions, abstract flag, nillable flag, constraints, annotation.
   - Type references (`type="xs:integer"`, `type="my:localType"`) are stored as **QName references** during parsing, resolved later.

4. **Reference Resolution** (Multi-pass): After all documents are parsed, Xerces performs **reference resolution**:
   - Resolve type references (`element/@type` → `XSTypeDefinition`)
   - Resolve attribute group references (`attributeGroup/@ref`)
   - Resolve model group references (`group/@ref`)
   - Resolve substitution group hierarchies
   - Resolve identity constraint references (`keyref/@refer`)
   - These are resolved via `SchemaGrammar.getGlobalElementDecl()`, `SchemaGrammar.getTypeDecl()`, etc.

5. **Schema Validation**: The compiled schema is validated against the schema-for-schemas (the XSD spec itself). This detects errors like:
   - Circular type derivations
   - Invalid facet combinations
   - Wrong content types for derivation
   - etc.

### Validation

Xerces-J's validation is driven by `XMLValidator` (with `SchemaValidator` as the XSD-specific implementation):

1. **Element Validation**: When the parser encounters an element start tag, it looks up the `XSElementDeclaration` from the grammar. If the element has a `@xsi:type`, it resolves the type override.

2. **Type Validation**: The `XSimpleTypeValidator` or `XComplexTypeValidator` checks:
   - Content matches the type definition
   - Facets are satisfied (for simple types)
   - Particle model is matched (for complex types with element content)
   - Attribute uses are satisfied

3. **Identity Constraint Checking**: `ValueStore` / `ValueStoreBase` track identity constraint state:
   - `xs:unique` / `xs:key` / `xs:keyref` are evaluated by walking the instance tree
   - Selector XPath is evaluated to find target nodes
   - Field XPaths are evaluated to extract values
   - Key uniqueness is checked, keyref references are resolved

4. **PSVI**: The `PSVIProvider` interface allows callers to retrieve Post Schema Validation Infoset information — the augmented type annotations on the validated XML.

### Key Design Patterns in Xerces-J

- **Grammar per namespace**: Each namespace maps to one `SchemaGrammar`. The `XMLGrammarPool` caches compiled grammars.
- **Lazy resolution**: Some references (especially type references) are deferred until validation time if they can't be resolved at compile time.
- **QName resolution**: All type references use QNames (namespace + local name), resolved through the schema's namespace context.
- **Scope**: Element declarations can be global (top-level in schema) or local (within a complex type). Scope affects whether they can be referenced from other places.
- **Substitution group handling**: The `substitutionGroup` property on `XSElementDeclaration` points to the head element. At validation time, elements in the substitution group are recognized by checking the affiliation chain.

---

## 2. libxml2 Architecture

libxml2 is a C library for XML processing. Its XSD processor is self-contained in the `xmlschemas.c`, `xmlschemastypes.c`, and `xmlregexp.c` source files.

### Internal Data Model

libxml2's XSD processor uses a flat struct-based data model:

| Component | C Struct | Role |
|-----------|----------|------|
| **Schema** | `xmlSchemaPtr` | Top-level compiled schema — holds all component lists, namespace map, and flags. |
| **Type** | `xmlSchemaTypePtr` | Type definition — a union struct with flags for simple/complex. Contains facets, particle tree, attribute uses. |
| **Element** | `xmlSchemaElementPtr` | Element declaration — name, target namespace, type (as a pointer), substitution group, scope, constraints. |
| **Attribute** | `xmlSchemaAttributePtr` | Attribute declaration — name, type, default/fixed, scope. |
| **Attribute Group** | `xmlSchemaAttributeGroupPtr` | Attribute group definition — list of attribute uses. |
| **Model Group** | `xmlSchemaModelGroupDefPtr` | Named model group definition. |
| **Particle** | `xmlSchemaParticlePtr` | A particle wrapping an element, model group, or wildcard with minOccurs/maxOccurs. |
| **Wildcard** | `xmlSchemaWildcardPtr` | Wildcard definition (any, anyAttribute). |
| **Facet** | `xmlSchemaFacetPtr` | A single facet (enumeration, pattern, length, etc.) — linked list. |
| **Identity Constraint** | `xmlSchemaIDCPtr` | Identity constraint (key, unique, keyref) — selector, fields, refer. |
| **Notation** | `xmlSchemaNotationPtr` | Notation declaration. |

### Schema Compilation

libxml2's compilation is a single monolithic function spread across `xmlschemas.c`:

1. **`xmlSchemaNewParserCtxt()`** → Creates a parsing context with namespace stack, target namespace, and schema location.

2. **`xmlSchemaParse()`** → The main compilation entry point:
   - Parses the XSD document using the XML parser
   - Handles `xs:include` (inlining the included schema into the same target namespace)
   - Handles `xs:import` (loading foreign-namespace schemas)
   - Handles `xs:redefine` (modifying existing types)
   - Builds component structs for each XSD construct
   - Stores components in flat lists on the `xmlSchemaPtr` (e.g., `types`, `elements`, `attributes`, `notations`)

3. **Post-parse resolution**: After parsing all documents, libxml2 does a second pass to resolve:
   - Type references (stored as strings during parsing → resolved to `xmlSchemaTypePtr`)
   - Substitution group hierarchies
   - Attribute group references
   - Model group references
   - Identity constraint `keyref/@refer`

4. **`xmlSchemaNewSchema()`** → Creates the final compiled schema struct.

### Validation

libxml2's validation is driven by `xmlSchemaValidateDoc()` (for in-memory trees) and `xmlSchemaValidateStream()` (for streaming):

1. **`xmlSchemaValidCtxtPtr`** → Validation context, holds state during validation:
   - Current element/type stack
   - Identity constraint state
   - Error callback

2. **Validation algorithm**:
   - Walk the XML tree depth-first
   - For each element: look up declaration, check type validity, check particle occurrence
   - For each attribute: look up declaration, check type validity
   - Evaluate identity constraints: `xmlSchemaIDCFillNodeTables()`, `xmlSchemaIDCCheckKey()`, `xmlSchemaIDCCheckKeyRef()`

3. **Error handling**: A single callback function (`xmlSchemaValidityErrorFunc`) receives errors with:
   - Error code (`XML_SCHEMAV_*` constants)
   - Error message
   - Line number
   - Severity level

### Key Differences from Xerces-J

| Aspect | Xerces-J | libxml2 |
|--------|----------|---------|
| **Language** | Java (OOP, interfaces) | C (structs, function pointers) |
| **Component organization** | Grammar-per-namespace, `SchemaGrammar` objects | Flat lists on `xmlSchemaPtr` |
| **Reference resolution** | QName-based, resolved via `SchemaGrammar` lookups | String-based, resolved via hash lookups |
| **PSVI** | First-class PSVI provider | No formal PSVI — validation results are boolean + errors |
| **Error granularity** | `ErrorHandler` with `SAXParseException` (severity, code, line, column) | Single callback with `xmlError` (domain, code, message, level, line) |
| **Substitution groups** | `substitutionGroup` property, resolved via grammar | `substitutionGroup` property, resolved via linked list on schema |
| **Identity constraints** | `ValueStore` with separate classes for each constraint type | Single `xmlSchemaIDCPtr` struct with state machine |
| **Schema compilation** | `XSDHandler` with multi-pass resolution | `xmlSchemaParse()` with two-pass resolution |
| **Thread safety** | Thread-safe when compiled grammars are not mutated | Not thread-safe — context state is mutable |

---

## 3. Component Model Pattern

The common architecture across all reference XSD validators is a **component model** — a structural representation of the XSD schema components as an in-memory graph with typed nodes and cross-references.

### Common Abstractions

All reference validators share these core abstractions, which map directly to the XSD 1.0 spec Part 1 component model:

```
Schema Component Model
├── Type Definitions
│   ├── Simple Type (atomic, list, union)
│   │   └── Facets (length, minLength, maxLength, pattern, enumeration, etc.)
│   └── Complex Type
│       ├── Content Type (element-only, simple, mixed, empty)
│       ├── Particle Tree (sequence, choice, all)
│       └── Attribute Uses (attribute references + wildcard)
├── Element Declarations
│   ├── Local (scoped to a type)
│   └── Global (top-level, referenceable)
├── Attribute Declarations
├── Model Group Definitions
├── Attribute Group Definitions
├── Identity Constraint Definitions (key, unique, keyref)
├── Wildcards (any, anyAttribute)
├── Notation Declarations
└── Annotations
```

### Cross-Reference Graph

The component model is a **graph**, not a tree:

```
ElementDeclaration
  ├── type → TypeDefinition
  ├── substitutionGroup → ElementDeclaration (head)
  └── scope → TypeDefinition | null (global)

ComplexTypeDefinition
  ├── baseType → TypeDefinition
  ├── particle → Particle
  │       └── term → ElementDeclaration | ModelGroup | Wildcard
  ├── attributeUses → AttributeUse[]
  │       └── attributeDeclaration → AttributeDeclaration
  └── attributeWildcard → Wildcard

SimpleTypeDefinition
  ├── baseType → TypeDefinition
  ├── variety → atomic | list | union
  ├── primitiveType → TypeDefinition (for atomic)
  ├── itemType → TypeDefinition (for list)
  └── memberTypes → TypeDefinition[] (for union)

IdentityConstraintDefinition
  ├── selector → XPathExpression
  ├── fields → XPathExpression[]
  ├── refer → IdentityConstraintDefinition (for keyref)
  └── scope → ElementDeclaration
```

### The Two-Phase Architecture

The single most important architectural pattern is the **separation of schema compilation from instance validation**:

```
Phase 1: Schema Compilation
┌──────────────────────────────────────────────────────────────────┐
│ Input: XSD Schema Documents (.xsd files)                        │
│                                                                  │
│ 1. Parse XML → DOM/SAX events                                   │
│ 2. Resolve includes/imports/redefines (recursive)               │
│ 3. Build component graph (typed nodes, cross-references)        │
│ 4. Resolve QName references (type="xs:integer", ref="my:group") │
│ 5. Build substitution group hierarchies                         │
│ 6. Validate schema against schema-for-schemas                   │
│ 7. Cache compiled schema component model                        │
│                                                                  │
│ Output: Compiled Schema Component Model (reusable, immutable)   │
└──────────────────────────────────────────────────────────────────┘

Phase 2: Instance Validation
┌──────────────────────────────────────────────────────────────────┐
│ Input: XML Instance Document + Compiled Schema Component Model   │
│                                                                  │
│ 1. Walk XML tree (depth-first)                                  │
│ 2. For each element:                                             │
│    a. Look up element declaration from compiled model            │
│    b. Resolve type (from declaration or @xsi:type)              │
│    c. Validate content against type definition                  │
│    d. Check particle occurrence constraints                     │
│    e. Check attribute uses                                      │
│ 3. Evaluate identity constraints (key, unique, keyref)          │
│ 4. Report errors (valid/invalid + error details)               │
│                                                                  │
│ Output: Validation Result (valid/invalid + error list)          │
└──────────────────────────────────────────────────────────────────┘
```

### Key Benefits of the Two-Phase Architecture

1. **Performance**: Schema compilation is done once; validation reuses the compiled model across many instance documents.
2. **Correctness**: The compiled model is validated against the XSD spec before any instance validation, so instance validation errors are not polluted by schema errors.
3. **Clarity**: The clean separation mirrors the XSD spec's own structure (Part 1: Schema Components, Part 2: Datatype validation).
4. **Testability**: Each phase can be tested independently.

---

## 4. Schema Compilation vs Validation — Detailed

### What Happens During Schema Compilation

1. **XSD Document Parsing**: The XSD XML is parsed into a preliminary representation. Xerces-J uses SAX events; libxml2 uses its DOM tree.

2. **Include/Import/Redefine Resolution**:
   - `xs:include`: Merges schema documents in the same target namespace. The included schema's components become part of the including schema's namespace.
   - `xs:import`: Loads schema documents for a different namespace. Creates a separate component namespace.
   - `xs:redefine`: Loads a schema document and allows redefining its types. Complex — must preserve original type hierarchy.

3. **Component Construction**: For each XSD element, a corresponding component object is created:
   - `xs:element` → ElementDeclaration
   - `xs:complexType` → ComplexTypeDefinition
   - `xs:simpleType` → SimpleTypeDefinition
   - etc.

4. **Reference Resolution**: References are resolved in multiple passes because components may reference other components that haven't been parsed yet:
   - Pass 1: Register all component names
   - Pass 2: Resolve type references
   - Pass 3: Resolve structural references (substitution groups, model groups, attribute groups)
   - Pass 4: Resolve identity constraint references (keyref/@refer)

5. **Schema Validation**: The compiled schema is validated:
   - All referenced types exist
   - No circular type derivations
   - Facet combinations are valid
   - Abstract elements/types are not used directly
   - etc.

### What Happens During Instance Validation

1. **Element Resolution**: For each element in the instance, find the corresponding `ElementDeclaration` from the compiled model. This involves:
   - Looking up by name + namespace
   - Checking substitution group affiliation (if the element name matches a member of a substitution group)
   - Handling `@xsi:type` (type override)

2. **Type Validation**: The element's content is validated against its type:
   - Simple types: Check facets (length, pattern, enumeration, etc.)
   - Complex types with simple content: Check the value against the simple type, then check attributes
   - Complex types with element content: Walk the particle tree — check occurrence counts, validate child elements recursively
   - Complex types with mixed content: Like element content, but text nodes are allowed between elements

3. **Attribute Validation**: For each attribute on the element:
   - Look up the attribute declaration
   - Validate the attribute value against its type
   - Check required attributes are present
   - Check no undeclared attributes (unless wildcard allows them)

4. **Identity Constraint Checking**:
   - Evaluate selector XPath to find target nodes
   - Evaluate field XPaths to extract key values
   - Check uniqueness (for key and unique)
   - Check keyref references match existing keys

### What Both Xerses-J and libxml2 Have in Common

| Feature | Both Implement |
|---------|---------------|
| Schema compilation phase | Yes |
| Instance validation phase | Yes |
| Cached compiled schema | Yes |
| Multi-pass reference resolution | Yes |
| Built-in type support (string, integer, date, etc.) | Yes |
| User-defined derived types | Yes |
| Type derivation (restriction, extension) | Yes |
| Model groups (sequence, choice, all) | Yes |
| Attribute groups | Yes |
| Substitution groups | Yes |
| Identity constraints (key, unique, keyref) | Yes |
| Wildcards (any, anyAttribute) | Yes |
| Schema-level validation | Yes |
| xsi:type override | Yes |
| xsi:nil handling | Yes |

---

## 5. Error Handling

### Xerces-J Error Handling

Xerces-J uses the standard SAX `ErrorHandler` interface:

```java
public interface ErrorHandler {
    void warning(SAXParseException exception) throws SAXException;
    void error(SAXParseException exception) throws SAXException;
    void fatalError(SAXParseException exception) throws SAXException;
}
```

Key characteristics:
- **Severity levels**: `warning`, `error`, `fatalError`
- **Error codes**: Defined in `XMLSchemaMessages.properties` — each error has a unique key (e.g., `SchemaMessages#SrcResolve`, `SchemaMessages#ParticleValid`)
- **Message format**: `{0}` parameterized messages with localization support
- **Location**: Line number, column number, public ID, system ID via `SAXParseException`
- **Error codes for schema compilation**: `SchemaMessageProvider` with codes like `GrammarNotFound`, `GrammarNotFoundFatal`, etc.
- **Error codes for validation**: `XMLMessageProvider` with codes for various validation errors

### libxml2 Error Handling

libxml2 uses a callback-based error system:

```c
typedef void (*xmlSchemaValidityErrorFunc)(void *ctx, const char *msg, ...);
typedef void (*xmlSchemaValidityWarningFunc)(void *ctx, const char *msg, ...);
```

The error information is also available in `xmlError` struct:

```c
typedef struct _xmlError {
    int domain;       // Error domain (XML_FROM_SCHEMASV, XML_FROM_SCHEMASP, etc.)
    int code;         // Error code (XML_SCHEMAV_*, XML_SCHEMAP_*)
    char *message;    // Human-readable error message
    int level;        // Severity (XML_ERR_NONE, XML_ERR_WARNING, XML_ERR_ERROR, XML_ERR_FATAL)
    char *file;       // Source file
    int line;         // Line number
    ...
} xmlError;
```

Error code categories:
- **`XML_SCHEMAP_*`** (schema compilation errors): `XML_SCHEMAP_ELEMENT_PROPS`, `XML_SCHEMAP_ATTR_PROPS`, `XML_SCHEMAP_COS_VALID_DEFAULT`, etc.
- **`XML_SCHEMAV_*`** (validation errors): `XML_SCHEMAV_ELEMENT_CONTENT`, `XML_SCHEMAV_ATTR_INVALID_VALUE`, `XML_SCHEMAV_CVC_MAXLENGTH_VALID`, etc.

### Comparison

| Aspect | Xerces-J | libxml2 |
|--------|----------|---------|
| Error reporting mechanism | SAX `ErrorHandler` interface | Callback function (`xmlSchemaValidityErrorFunc`) |
| Error codes | Unique keys in message properties files | `XML_SCHEMAV_*` / `XML_SCHEMAP_*` enum constants |
| Severity | warning, error, fatalError | NONE, WARNING, ERROR, FATAL |
| Location | Line, column, public ID, system ID | File, line |
| Localization | Yes (Java resource bundles) | No (English messages) |
| Schema-specific errors | Dedicated `SchemaMessageProvider` | `XML_SCHEMAP_*` prefix in domain |
| Validation-specific errors | Dedicated `XMLMessageProvider` | `XML_SCHEMAV_*` prefix in domain |
| Error recovery | Continues after error (unless fatal) | Continues after error (unless fatal) |

---

## 6. Test Suite Integration (XSTS)

### How Reference Validators Integrate with the XSTS

**Xerces-J**:
- Xerces-J has a dedicated XSTS test runner as part of the JUnit test suite
- The test runner reads the XSTS metadata files (`suite.xml`, test sets), runs each test case through the Xerces validator, and compares the result against the expected outcome
- Results are reported as JUnit test results
- The test runner is located in the Xerces-J source tree under `tests/` or `samples/` directories

**libxml2**:
- libxml2 includes XSTS test integration in `test/schemas/` directory
- The `runtest.c` program has a `testSchema()` function that runs XSTS tests
- Tests are run by comparing the validation result against the expected outcome
- The test runner supports both individual test files and the full XSTS manifest

### Common Patterns

Both reference validators use a **similar approach** to XSTS integration:

1. **Parse the manifest**: Read the XSTS XML metadata files (`.testSet`, `.xml`)
2. **Iterate test groups**: For each `testGroup`, extract `schemaTest` and `instanceTest` elements
3. **Run the test**: Load the schema file(s), validate the instance file (if instance test), or validate the schema (if schema test)
4. **Compare result**: Check if the actual outcome matches the expected outcome (`valid`, `invalid`, `implementation-defined`, etc.)
5. **Report**: Accumulate results (pass/fail/skip) and report

### Key Differences

| Aspect | Xerces-J | libxml2 |
|--------|----------|---------|
| Test framework | JUnit | Custom C test runner |
| Manifest parsing | Java XML parser | libxml2's own XML parser |
| Expected outcome comparison | Direct boolean comparison | Boolean + implementation-defined handling |
| Skip handling | Tests with `implementation-defined` can be skipped | Tests with `implementation-defined` can be skipped |
| Filtering | Can filter by test set name | Can filter by test group name |

### Relevance to Checkr

The key insight for checkr's test runner design is that both reference validators handle the XSTS in the same way:
1. Use the XSTS metadata as the test specification
2. Run each test case through the validator
3. Compare the boolean outcome against expected
4. Handle `implementation-defined` / `implementation-dependent` outcomes by configuration

This means checkr's test runner can follow the same pattern without needing to invent a new test format.

---

## 7. Key Design Decisions in Building an XSD Processor

Building on the analysis of Xerces-J and libxml2, here are the hardest design decisions:

### 1. Lazy vs Eager Reference Resolution

**Problem**: Cross-references in XSD schemas form a graph, not a tree. Element declarations reference types, types reference base types, model groups reference element declarations. How eagerly should references be resolved?

| Approach | Pros | Cons |
|----------|------|------|
| **Eager** (Xerces-J) | All references resolved at compile time. Validation is fast and predictable. | Slower compilation. Must handle circular references gracefully. |
| **Lazy** (libxml2) | Faster compilation, can handle forward references naturally. | Must handle unresolvable references at validation time. More complex state management. |

**Recommendation**: Eager resolution with multi-pass compilation is the standard approach. Xerces-J's multi-pass model is the reference. Lazy resolution adds complexity without clear benefit for a TypeScript implementation.

### 2. Schema Component Identity

**Problem**: Schema components are identified by (namespace, name) pairs. But what about anonymous components (local types, unnamed model groups)? How do you reference them?

**Approach**: Use QName (namespace + local name) for named components. Anonymous components use a generated identity or are referenced by position within their parent. Xerces-J uses `XSObject` with a name property; anonymous types get a synthesized name or are reached via their parent element declaration.

### 3. Namespace Handling

**Problem**: Schema components are organized by namespace. Each namespace has its own set of global components. `xs:import` bridges namespaces, `xs:include` merges within a namespace.

**Approach**: Grammar-per-namespace (Xerces-J) vs flat list with namespace flags (libxml2). The grammar-per-namespace model is cleaner and matches the spec's conceptual model.

### 4. Type Derivation (Restriction vs Extension)

**Problem**: XSD supports two forms of type derivation — restriction and extension. Restriction narrows a type; extension adds to it. The rules for valid restriction are complex (the "Restriction of Complex Types" clause in the spec is one of the most complex parts).

**Approach**: Both validators implement the full validity rules for restriction and extension. The restriction of complex types with `all`-groups is particularly hard and has three implementation-defined behaviors (see XSTS research).

### 5. Substitution Group Handling

**Problem**: Substitution groups allow an element to be substituted for another element. The hierarchy can be deep and cycles must be detected.

**Approach**: Build a substitution group hierarchy at compile time. At validation time, check if the instance element is a member of the expected element's substitution group by walking the hierarchy. xsi:type overrides the element's type.

### 6. Identity Constraint Evaluation

**Problem**: Identity constraints (key, unique, keyref) require evaluating XPath expressions against the instance tree, tracking values across the tree, and checking uniqueness/references at the end.

**Approach**: Build a selector → fields → value table during validation. Key values are collected during validation; keyref values are checked against the key table at the end. This is complex state management, especially for nested identity constraints.

### 7. Schema Validation vs Schema-for-Schemas

**Problem**: Should the validator validate the schema itself against the XSD spec (schema-for-schemas) before accepting it?

**Approach**: Both Xerces-J and libxml2 validate schemas as part of compilation. This is essential for correctness — a malformed schema should produce a compilation error, not a confusing validation error. The schema-for-schemas itself is a set of XSD files that define the XSD language.

### 8. PSVI (Post Schema Validation Infoset)

**Problem**: Should the validator augment the parsed XML with type information after validation?

**Approach**: Xerces-J provides a `PSVIProvider` interface. libxml2 does not provide formal PSVI. For checkr, PSVI may be useful for downstream consumers but adds complexity.

### 9. Thread Safety and Caching

**Problem**: Schema compilation is expensive. Can the compiled schema be cached and reused across threads/documents?

**Approach**: Xerces-J uses `XMLGrammarPool` for caching. Compiled schemas are immutable and thread-safe. Validation contexts are per-thread and mutable. libxml2's schemas are not thread-safe for concurrent validation.

### 10. Error Recovery

**Problem**: When a validation error is found, should the validator continue or stop?

**Approach**: Both validators continue after errors (unless fatal) to report all errors in one pass. This is the expected behavior — users want to see all validation errors, not just the first one.

---

## Summary of Design Recommendations for Checkr

Based on the research, these are the architectural patterns checkr should follow:

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **Architecture** | Two-phase (compile → validate) | Both reference validators use this. It's the canonical pattern. |
| **Component model** | Typed graph with cross-references | Maps directly to XSD spec Part 1 components. |
| **Reference resolution** | Multi-pass eager | Matches Xerces-J. Forward references are already handled. |
| **Namespace organization** | Grammar-per-namespace | Cleaner than flat model. Matches XSD spec's namespace model. |
| **Schema validation** | Validate schema at compile time | Both validators do this. Essential for correctness. |
| **Error handling** | Severity levels + error codes | Both validators use this. Checkr should define its own error code taxonomy. |
| **Identity constraints** | ValueStore pattern | Matches both validators. Complex but necessary state machine. |
| **PSVI** | Optional, later | Xerces-J has it; libxml2 doesn't. Can be added after core validation works. |
| **Test runner** | XSTS metadata-driven | Both validators use the XSTS manifest files directly. Follow the same pattern. |

> **Note**: These are research findings, not architecture decisions. Architecture decisions for checkr are deferred to a separate grilling ticket (see the map's **Not yet specified** entries).

---

## References

- Apache Xerces-J source code: <https://github.com/apache/xerces2-j>
  - `src/org/apache/xerces/impl/xs/` — Schema compilation and validation
  - `src/org/apache/xerces/impl/xs/models/` — Particle/Content model
  - `src/org/apache/xerces/impl/xs/identity/` — Identity constraint handling
  - `src/org/apache/xerces/impl/xs/util/` — Grammar pool, XSObjectList, etc.

- libxml2 source code: <https://gitlab.gnome.org/GNOME/libxml2>
  - `xmlschemas.c` — Schema compilation (main file)
  - `xmlschemastypes.c` — Schema type validation
  - `xmlregexp.c` — Regular expression support for facets
  - `include/libxml/xmlschemas.h` — Public API

- W3C XML Schema Specification:
  - Part 1: Structures: <https://www.w3.org/TR/xmlschema-1/>
  - Part 2: Datatypes: <https://www.w3.org/TR/xmlschema-2/>
  - FSSM (Finite State Schema Machine): <https://www.w3.org/TR/xmlschema-1/#fsm>