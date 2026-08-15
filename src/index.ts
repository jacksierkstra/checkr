export { Checkr } from "@lib/core/main";
export { ValidationResult } from "@lib/types/validation";
export { Validator, ValidatorImpl } from "@lib/validator/validator";
export { XMLParser, XMLParserImpl } from "@lib/xml/parser";
export { XSDParser } from "@lib/xsd/parser";
export { XSDPipelineParserImpl } from "@lib/xsd/pipeline/parser";

// Two-phase API (CHK-008) — lives beside the legacy single-shot pipeline.
export { compileSchema, validate } from "@lib/core/compiled";
export type { CompileOptions } from "@lib/xsd/compiler/schemaCompiler";
export type { ValidateOptions } from "@lib/validator/compiled/instanceValidator";
export {
    SchemaCompilationError,
} from "@lib/types/schema-error";
export type {
    SchemaError,
    SchemaErrorCode,
    SchemaErrorListener,
    SchemaLocation,
    SchemaPhase,
    SchemaSeverity,
    SchemaValidationResult,
} from "@lib/types/schema-error";
export type {
    AttributeDeclaration,
    AttributeUse,
    ComplexTypeDefinition,
    CompiledGrammar,
    CompiledSchema,
    ContentType,
    ElementDeclaration,
    Facet,
    ModelGroup,
    ModelGroupKind,
    Particle,
    ParticleTerm,
    QName,
    SimpleTypeDefinition,
    SimpleTypeVariety,
    TypeDefinition,
    Wildcard,
} from "@lib/types/component-graph";
export { qnameKey, qnameEqual, displayQName } from "@lib/types/component-graph";
