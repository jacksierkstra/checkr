/**
 * Error taxonomy for the two-phase XSD processor (see docs/adr/architecture-component-model.md §6).
 *
 * A single `SchemaError` carries severity, a stable code, a human-readable
 * parameterized message, a source location, and the phase that raised it.
 * Errors are reported through a listener rather than thrown, so processing
 * continues after non-fatal errors and reports all issues in one pass.
 * Fatalness is carried on the severity axis: only `error`/`fatal` entries
 * make a compilation fail or an instance invalid.
 */

export type SchemaSeverity = "warning" | "error" | "fatal";

export type SchemaPhase = "schema-compilation" | "instance-validation";

export interface SchemaLocation {
    line: number;
    column: number;
    systemId?: string;
}

export type SchemaErrorCode =
    /** The XSD document is not well-formed XML or is not an xs:schema element. */
    | "INVALID_SCHEMA_DOCUMENT"
    /** The instance document is not well-formed XML. */
    | "INVALID_INSTANCE_DOCUMENT"
    /** A QName reference (type, base, itemType, memberTypes) resolves to nothing. */
    | "UNRESOLVED_TYPE"
    /** An element/attribute reference (ref=) resolves to no global declaration. */
    | "UNRESOLVED_REFERENCE"
    /** The instance root element is not declared as a global element in the schema. */
    | "UNDECLARED_ELEMENT"
    /** A child element does not fit the declared content model. */
    | "UNEXPECTED_ELEMENT"
    /** A required particle (minOccurs) is not satisfied. */
    | "MISSING_REQUIRED_ELEMENT"
    /** Character data appears where the content type forbids it (element-only/empty). */
    | "UNEXPECTED_TEXT_CONTENT"
    /** An instance attribute is not declared by the type's attribute uses. */
    | "UNDECLARED_ATTRIBUTE"
    /** A required attribute use is missing from the instance. */
    | "MISSING_REQUIRED_ATTRIBUTE"
    /** Element child nodes appear where the type does not allow element content. */
    | "INVALID_ELEMENT_CONTENT"
    /** An instance value fails a facet of its simple type (length family, enumeration, ...). */
    | "FACET_VIOLATION"
    /** An instance value violates a built-in type's lexical space (CHK-011..014). */
    | "LEXICAL_SPACE_VIOLATION"
    /** An instance value is not valid in any member type of a union (CHK-016). */
    | "UNION_VIOLATION"
    /** A pattern facet value is not a valid XSD regular expression (CHK-015). */
    | "INVALID_PATTERN"
    /** A compiled construct exists but the processor does not validate it yet. */
    | "UNSUPPORTED_FEATURE"
    /** The content model has a Unique Particle Attribution (UPA) violation (XSD 1.0 §3.8.6). */
    | "AMBIGUOUS_CONTENT_MODEL"
    /** A model group or attribute group references itself (directly or transitively). */
    | "CIRCULAR_REFERENCE"
    /** A complex/simple content extension violates the spec's extension rules (CHK-020). */
    | "INVALID_EXTENSION"
    /** A complex/simple content restriction violates the spec's restriction rules (CHK-020). */
    | "INVALID_RESTRICTION"
    /** Complex type restriction with an xs:all group is rejected (CTR-all-compile, CHK-020). */
    | "ALL_GROUP_RESTRICTION"
    /** A complex type derives from itself (directly or transitively, CHK-020). */
    | "CIRCULAR_DERIVATION"
    /** An identity-constraint selector/field XPath is not in the XSD subset (CHK-022). */
    | "INVALID_IDENTITY_PATH"
    /** A unique/key/keyref tuple violates the identity constraint (CHK-022). */
    | "IDENTITY_CONSTRAINT_VIOLATION"
    /** A key field node-set is empty (the field has no value, CHK-022). */
    | "KEY_FIELD_MISSING"
    /** A key field's value node is an element assessed against a nillable declaration with xsi:nil (CHK-022). */
    | "KEY_FIELD_NIL"
    /** A keyref targets a key-sequence that has no entry in the referenced key/unique node table (CHK-022). */
    | "KEYREF_VIOLATION";

export interface SchemaError {
    severity: SchemaSeverity;
    code: SchemaErrorCode;
    message: string;
    location: SchemaLocation;
    phase: SchemaPhase;
}

export type SchemaErrorListener = (error: SchemaError) => void;

/**
 * Thrown by `compileSchema` when compilation produced at least one
 * `error`/`fatal` SchemaError. Carries the full error list; the same errors
 * are also delivered to the listener before the throw (see CHK-008).
 */
export class SchemaCompilationError extends Error {
    readonly errors: SchemaError[];

    constructor(errors: SchemaError[]) {
        super(`Schema compilation failed with ${errors.length} error(s).`);
        this.name = "SchemaCompilationError";
        this.errors = errors;
        Object.setPrototypeOf(this, SchemaCompilationError.prototype);
    }
}

/** Result of validating an instance document against a `CompiledSchema`. */
export interface SchemaValidationResult {
    valid: boolean;
    errors: SchemaError[];
}