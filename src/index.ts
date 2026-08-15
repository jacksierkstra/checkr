// Public two-phase API (docs/adr/architecture-component-model.md §3):
//   compileSchema(xsd) -> CompiledSchema      (phase 1, immutable)
//   validate(xml, schema) -> SchemaValidationResult   (phase 2)
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
    NamespaceConstraint,
    Particle,
    ParticleTerm,
    QName,
    SimpleTypeDefinition,
    SimpleTypeVariety,
    TypeDefinition,
    Wildcard,
} from "@lib/types/component-graph";
export { qnameKey, qnameEqual, displayQName } from "@lib/types/component-graph";
