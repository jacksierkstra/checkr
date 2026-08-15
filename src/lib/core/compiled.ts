import { XMLParserImpl } from "@lib/xml/parser";
import { SchemaCompiler, SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { InstanceValidator, InstanceValidatorImpl } from "@lib/validator/compiled/instanceValidator";

/**
 * Public two-phase API (see docs/adr/architecture-component-model.md §3):
 *
 *   compileSchema(xsd) -> CompiledSchema      (phase 1, immutable)
 *   validate(xml, schema) -> SchemaValidationResult   (phase 2)
 *
 * Compile once, validate many: the compiled schema is a deeply frozen,
 * immutable component graph that is safe to reuse across validate calls.
 * A malformed schema throws SchemaCompilationError at compile time; instance
 * problems are reported as SchemaError objects on the result and listener.
 */

const xmlParser = new XMLParserImpl();
const compiler: SchemaCompiler = new SchemaCompilerImpl(xmlParser);
const instanceValidator: InstanceValidator = new InstanceValidatorImpl(xmlParser);

export function compileSchema(
    xsd: string,
    options: Parameters<SchemaCompiler["compile"]>[1] = {}
): ReturnType<SchemaCompiler["compile"]> {
    return compiler.compile(xsd, options);
}

export function validate(
    instance: string,
    schema: Parameters<InstanceValidator["validate"]>[1],
    options: Parameters<InstanceValidator["validate"]>[2] = {}
): ReturnType<InstanceValidator["validate"]> {
    return instanceValidator.validate(instance, schema, options);
}