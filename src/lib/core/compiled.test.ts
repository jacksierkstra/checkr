import { compileSchema, validate } from "@lib/core/compiled";
import { CompiledSchema } from "@lib/types/component-graph";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
import { SchemaCompilationError, SchemaError } from "@lib/types/schema-error";

const MINIMAL_XSD = `
    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
        <xsd:element name="root">
            <xsd:complexType>
                <xsd:sequence>
                    <xsd:element name="foo" type="xsd:string"/>
                    <xsd:element name="bar" type="xsd:string"/>
                </xsd:sequence>
            </xsd:complexType>
        </xsd:element>
    </xsd:schema>
`;

describe("public two-phase surface — compileSchema / validate (CHK-008)", () => {

    it("compiles and validates a conforming instance end-to-end", () => {
        const schema = compileSchema(MINIMAL_XSD);
        const { valid, errors } = validate(`<root><foo>a</foo><bar>b</bar></root>`, schema);
        expect(valid).toBe(true);
        expect(errors).toHaveLength(0);
    });

    it("compiles and validates a non-conforming instance end-to-end", () => {
        const schema = compileSchema(MINIMAL_XSD);
        const { valid, errors } = validate(`<root><foo>a</foo></root>`, schema);
        expect(valid).toBe(false);
        expect(errors[0]).toMatchObject({ code: "MISSING_REQUIRED_ELEMENT", phase: "instance-validation" });
    });

    it("throws SchemaCompilationError and reports through the compile listener on bad schemas", () => {
        const brokenXsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root" type="MissingType"/>
            </xsd:schema>
        `;
        const seen: SchemaError[] = [];
        expect(() => compileSchema(brokenXsd, { listener: (e) => seen.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(seen[0]!.code).toBe("UNRESOLVED_TYPE");
    });

    it("reports validation errors through the validate listener", () => {
        const schema = compileSchema(MINIMAL_XSD);
        const seen: SchemaError[] = [];
        const { valid, errors } = validate(`<root><foo>a</foo></root>`, schema, {
            listener: (e) => seen.push(e),
        });
        expect(valid).toBe(false);
        expect(seen).toEqual(errors);
    });

    it("compileSchema results are frozen and reusable across validate calls", () => {
        const schema = compileSchema(MINIMAL_XSD);
        expect(Object.isFrozen(schema)).toBe(true);
        expect(validate(`<root><foo>a</foo><bar>b</bar></root>`, schema).valid).toBe(true);
        expect(validate(`<root><foo>a</foo></root>`, schema).valid).toBe(false);
        const before = JSON.stringify((schema as unknown as { grammars: unknown }).grammars);
        validate(`<root/>`, schema);
        expect(JSON.stringify((schema as unknown as { grammars: unknown }).grammars)).toBe(before);
    });

    it("compiles a schema from a string input — mutation of the input has no channel to the compiled graph", () => {
        // The API accepts an immutable string; the compiled graph is a fresh,
        // frozen object tree with no reference back to the input document.
        const schema: CompiledSchema = compileSchema(MINIMAL_XSD);
        expect(schema.grammars.get("")!.elements.get("root")!.type).not.toBeNull();
        expect(Object.isFrozen(schema.grammars.get("")!.elements.get("root")!)).toBe(true);
    });

});