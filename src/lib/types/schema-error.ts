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
    /** A QName reference (type, base, itemType, memberTypes, element ref) resolves to nothing. */
    | "UNRESOLVED_TYPE"
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
    /** A compiled construct exists but the processor does not validate it yet. */
    | "UNSUPPORTED_FEATURE";

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