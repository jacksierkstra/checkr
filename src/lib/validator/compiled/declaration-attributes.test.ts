import { XMLParserImpl } from "@lib/xml/parser";
import { SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { InstanceValidatorImpl } from "@lib/validator/compiled/instanceValidator";
import { CompiledSchema, ElementDeclaration } from "@lib/types/component-graph";
import { NAMESPACE_XSD, NAMESPACE_XSI } from "@lib/types/namespaces";
import { SchemaCompilationError, SchemaError, SchemaValidationResult } from "@lib/types/schema-error";

const compiler = new SchemaCompilerImpl(new XMLParserImpl());
const validator = new InstanceValidatorImpl(new XMLParserImpl());

function compile(xsd: string): CompiledSchema {
    return compiler.compile(xsd);
}

function compileWithErrors(xsd: string): SchemaError[] {
    try {
        compiler.compile(xsd);
        return [];
    } catch (e) {
        if (e instanceof SchemaCompilationError) return e.errors;
        throw e;
    }
}

function check(xml: string, schema: CompiledSchema): SchemaValidationResult {
    return validator.validate(xml, schema);
}

describe("Declaration attributes (CHK-023)", () => {

    // -----------------------------------------------------------------------
    // Substitution groups
    // -----------------------------------------------------------------------

    describe("substitution groups", () => {

        const SUB_XSD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element ref="shape"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>

                <xsd:element name="shape" type="xsd:string"/>
                <xsd:element name="circle" type="xsd:string" substitutionGroup="shape"/>
                <xsd:element name="square" type="xsd:string" substitutionGroup="shape"/>
            </xsd:schema>
        `;

        it("accepts the head and every direct member in place of the head", () => {
            const schema = compile(SUB_XSD);
            expect(check(`<root><shape>s</shape></root>`, schema).valid).toBe(true);
            expect(check(`<root><circle>c</circle></root>`, schema).valid).toBe(true);
            expect(check(`<root><square>q</square></root>`, schema).valid).toBe(true);
        });

        it("records the substitution group on the grammar with the head as a member", () => {
            const schema = compile(SUB_XSD);
            const grammar = schema.grammars.get("")!;
            const group = grammar.substitutionGroups.get("shape")!;
            expect(group.map((d) => d.name.localName).sort()).toEqual(["circle", "shape", "square"]);
            // The head itself is first (the closure starts from the head).
            expect(group[0]!.name.localName).toBe("shape");
        });

        it("resolves transitive substitution group membership", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="vehicle"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="vehicle" type="xsd:string"/>
                    <xsd:element name="car" type="xsd:string" substitutionGroup="vehicle"/>
                    <xsd:element name="sportsCar" type="xsd:string" substitutionGroup="car"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const group = schema.grammars.get("")!.substitutionGroups.get("vehicle")!;
            expect(group.map((d) => d.name.localName).sort()).toEqual(["car", "sportsCar", "vehicle"]);
            expect(check(`<root><sportsCar>x</sportsCar></root>`, schema).valid).toBe(true);
        });

        it("rejects an element that is not a member", () => {
            const schema = compile(SUB_XSD);
            const { valid } = check(`<root><triangle>t</triangle></root>`, schema);
            expect(valid).toBe(false);
        });

        it("works with a target namespace and default xmlns (unprefixed QNames resolve to the target namespace)", () => {
            const TN = "urn:shapes";
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" xmlns="${TN}" targetNamespace="${TN}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="shape"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="shape" type="xsd:string"/>
                    <xsd:element name="circle" type="xsd:string" substitutionGroup="shape"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const group = schema.grammars.get(TN)!.substitutionGroups.get("shape")!;
            expect(group.map((d) => d.name.localName).sort()).toEqual(["circle", "shape"]);
            expect(check(`<root xmlns="${TN}"><shape>s</shape></root>`, schema).valid).toBe(true);
            expect(check(`<root xmlns="${TN}"><circle>c</circle></root>`, schema).valid).toBe(true);
        });

        it("reports an unresolved substitution group head at compile time", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="shape" type="xsd:string" substitutionGroup="missing"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "UNRESOLVED_REFERENCE" && e.message.includes("missing"))).toBe(true);
        });

        it("reports a cross-namespace affiliation as unresolved (single-document schemas have one grammar)", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" xmlns:t="urn:other" targetNamespace="urn:self">
                    <xsd:element name="shape" type="xsd:string"/>
                    <xsd:element name="circle" type="xsd:string" substitutionGroup="t:shape"/>
                </xsd:schema>
            `);
            // The head lives in urn:self; the affiliation points at urn:other,
            // which no grammar provides — an unresolved reference. (Once
            // multi-document schemas land (CHK-024) a resolvable foreign head
            // must be rejected for crossing the target namespace.)
            expect(errors.some((e) => e.code === "UNRESOLVED_REFERENCE" && e.message.includes("does not resolve"))).toBe(true);
        });

        it("rejects an element declaring itself as its own head", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="shape" type="xsd:string" substitutionGroup="shape"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "CIRCULAR_REFERENCE")).toBe(true);
        });

        it("rejects a circular substitution group (A in B, B in A)", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="a" type="xsd:string" substitutionGroup="b"/>
                    <xsd:element name="b" type="xsd:string" substitutionGroup="a"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "CIRCULAR_REFERENCE")).toBe(true);
        });

        it("rejects a member whose type is not derived from the head's type", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="BaseT"><xsd:sequence><xsd:element name="a" type="xsd:string"/></xsd:sequence></xsd:complexType>
                    <xsd:complexType name="OtherT"><xsd:sequence><xsd:element name="b" type="xsd:string"/></xsd:sequence></xsd:complexType>
                    <xsd:element name="base" type="BaseT"/>
                    <xsd:element name="member" type="OtherT" substitutionGroup="base"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.message.includes("validly derived") || e.message.includes("type"))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // abstract
    // -----------------------------------------------------------------------

    describe("abstract elements and types", () => {

        const ABSTRACT_XSD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element ref="animal"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>

                <xsd:element name="animal" type="xsd:string" abstract="true"/>
                <xsd:element name="dog" type="xsd:string" substitutionGroup="animal"/>
                <xsd:element name="cat" type="xsd:string" substitutionGroup="animal"/>
            </xsd:schema>
        `;

        it("rejects the abstract head instantiated directly", () => {
            const schema = compile(ABSTRACT_XSD);
            const { valid, errors } = check(`<root><animal>x</animal></root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "ABSTRACT_ELEMENT")).toBe(true);
        });

        it("accepts non-abstract members in place of the abstract head", () => {
            const schema = compile(ABSTRACT_XSD);
            expect(check(`<root><dog>x</dog></root>`, schema).valid).toBe(true);
            expect(check(`<root><cat>x</cat></root>`, schema).valid).toBe(true);
        });

        it("rejects an abstract type used directly", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root" type="AbstractT"/>
                    <xsd:complexType name="AbstractT" abstract="true">
                        <xsd:sequence><xsd:element name="a" type="xsd:string"/></xsd:sequence>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const { valid, errors } = check(`<root><a>x</a></root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "ABSTRACT_TYPE")).toBe(true);
        });

        it("rejects an abstract root element", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root" type="xsd:string" abstract="true"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const { valid, errors } = check(`<root>x</root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "ABSTRACT_ELEMENT")).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // block
    // -----------------------------------------------------------------------

    describe("block and blockDefault", () => {

        const BLOCK_XSD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element ref="shape"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>

                <xsd:element name="shape" type="xsd:string" block="substitution"/>
                <xsd:element name="circle" type="xsd:string" substitutionGroup="shape"/>
            </xsd:schema>
        `;

        it("blocks substitution members when block=\"substitution\"", () => {
            const schema = compile(BLOCK_XSD);
            expect(check(`<root><shape>s</shape></root>`, schema).valid).toBe(true);
            const { valid, errors } = check(`<root><circle>c</circle></root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "BLOCKED_SUBSTITUTION")).toBe(true);
        });

        it("expands block=\"#all\" to include substitution", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="shape"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="shape" type="xsd:string" block="#all"/>
                    <xsd:element name="circle" type="xsd:string" substitutionGroup="shape"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const decl = (schema.grammars.get("")!.elements.get("shape")!);
            expect(decl.block.split(/\s+/)).toContain("substitution");
            expect(check(`<root><circle>c</circle></root>`, schema).valid).toBe(false);
        });

        it("applies blockDefault to element declarations without an explicit block", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" blockDefault="substitution">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="shape"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="shape" type="xsd:string"/>
                    <xsd:element name="circle" type="xsd:string" substitutionGroup="shape"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><shape>s</shape></root>`, schema).valid).toBe(true);
            expect(check(`<root><circle>c</circle></root>`, schema).valid).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // nillable / xsi:nil
    // -----------------------------------------------------------------------

    describe("nillable and xsi:nil", () => {

        const NIL_XSD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string" nillable="true"/>
                            <xsd:element name="b" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;

        it("accepts xsi:nil=\"true\" on a nillable element with empty content", () => {
            const schema = compile(NIL_XSD);
            expect(check(
                `<root xmlns:xsi="${NAMESPACE_XSI}"><a xsi:nil="true"/><b>x</b></root>`,
                schema
            ).valid).toBe(true);
        });

        it("rejects xsi:nil=\"true\" on a non-nillable element", () => {
            const schema = compile(NIL_XSD);
            const { valid, errors } = check(
                `<root xmlns:xsi="${NAMESPACE_XSI}"><a xsi:nil="true"/><b xsi:nil="true"/></root>`,
                schema
            );
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "INVALID_NIL" && e.message.includes("b"))).toBe(true);
        });

        it("rejects a nilled element with element children", () => {
            const schema = compile(NIL_XSD);
            const { valid, errors } = check(
                `<root xmlns:xsi="${NAMESPACE_XSI}"><a xsi:nil="true"><child/></a><b>x</b></root>`,
                schema
            );
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "INVALID_NIL")).toBe(true);
        });

        it("rejects a nilled element with non-whitespace text", () => {
            const schema = compile(NIL_XSD);
            const { valid, errors } = check(
                `<root xmlns:xsi="${NAMESPACE_XSI}"><a xsi:nil="true">text</a><b>x</b></root>`,
                schema
            );
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "INVALID_NIL")).toBe(true);
        });

        it("treats xsi:nil=\"false\" as no nil and validates normally", () => {
            const schema = compile(NIL_XSD);
            expect(check(
                `<root xmlns:xsi="${NAMESPACE_XSI}"><a xsi:nil="false">value</a><b>x</b></root>`,
                schema
            ).valid).toBe(true);
        });

        it("skips value validation for a nilled element", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:integer" nillable="true"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(
                `<root xmlns:xsi="${NAMESPACE_XSI}"><a xsi:nil="true"/></root>`,
                schema
            ).valid).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // default / fixed
    // -----------------------------------------------------------------------

    describe("element default and fixed", () => {

        const FIXED_XSD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="code" type="xsd:string" fixed="ABC"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;

        it("enforces the fixed value against the instance value", () => {
            const schema = compile(FIXED_XSD);
            expect(check(`<root><code>ABC</code></root>`, schema).valid).toBe(true);
            const { valid, errors } = check(`<root><code>XYZ</code></root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "FIXED_VALUE_VIOLATION")).toBe(true);
        });

        it("parses default and carries it on the declaration without affecting requiredness", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string" default="d" minOccurs="0"/>
                                <xsd:element name="b" type="xsd:string" default="d"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type;
            if (complex?.kind !== "complex-type" || complex.particle?.term.kind !== "sequence") {
                throw new Error("unexpected content model");
            }
            const firstParticle = complex.particle.term.particles[0]!;
            const decl: ElementDeclaration = firstParticle.term.kind === "element"
                ? firstParticle.term
                : (() => { throw new Error("unexpected particle term"); })();
            expect(decl.default).toBe("d");
            // A default does not relax requiredness: b is still required.
            expect(check(`<root><a>x</a></root>`, schema).valid).toBe(false);
            // An absent optional element with a default is fine.
            expect(check(`<root><a>x</a><b>y</b></root>`, schema).valid).toBe(true);
        });

        it("rejects an element declaring both default and fixed", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string" default="x" fixed="y"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.message.includes("mutually exclusive"))).toBe(true);
        });

        it("rejects a value constraint on an element whose type has element content", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="T">
                        <xsd:sequence><xsd:element name="a" type="xsd:string"/></xsd:sequence>
                    </xsd:complexType>
                    <xsd:element name="root" type="T" fixed="x"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.message.includes("simple content"))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // final
    // -----------------------------------------------------------------------

    describe("final on types and finalDefault", () => {

        it("blocks a complex type derivation method listed in the base's final", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="BaseT" final="extension">
                        <xsd:sequence><xsd:element name="a" type="xsd:string"/></xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="DerivedT">
                        <xsd:complexContent>
                            <xsd:extension base="BaseT">
                                <xsd:sequence><xsd:element name="b" type="xsd:string"/></xsd:sequence>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FINAL" && e.message.includes("extension"))).toBe(true);
        });

        it("allows a restriction when the base's final only lists extension", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="BaseT" final="extension">
                        <xsd:sequence><xsd:element name="a" type="xsd:string"/></xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="DerivedT">
                        <xsd:complexContent>
                            <xsd:restriction base="BaseT">
                                <xsd:sequence><xsd:element name="a" type="xsd:string"/></xsd:sequence>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            expect(compile(xsd)).toBeDefined();
        });

        it("applies finalDefault to types without an explicit final", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" finalDefault="extension">
                    <xsd:complexType name="BaseT">
                        <xsd:sequence><xsd:element name="a" type="xsd:string"/></xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="DerivedT">
                        <xsd:complexContent>
                            <xsd:extension base="BaseT">
                                <xsd:sequence><xsd:element name="b" type="xsd:string"/></xsd:sequence>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FINAL")).toBe(true);
        });

        it("blocks a simple type restriction whose base is final with respect to restriction", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="BaseS" final="restriction">
                        <xsd:restriction base="xsd:string"/>
                    </xsd:simpleType>
                    <xsd:simpleType name="DerivedS">
                        <xsd:restriction base="BaseS"/>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FINAL" && e.message.includes("restriction"))).toBe(true);
        });

        it("blocks a list whose item type is final with respect to list", () => {
            const errors = compileWithErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Item" final="list">
                        <xsd:restriction base="xsd:string"/>
                    </xsd:simpleType>
                    <xsd:simpleType name="ListOfItem">
                        <xsd:list itemType="Item"/>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FINAL" && e.message.includes("list"))).toBe(true);
        });

        it("still allows restricting built-in types (built-ins are not final)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyString">
                        <xsd:restriction base="xsd:string">
                            <xsd:maxLength value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root" type="MyString"/>
                </xsd:schema>
            `;
            expect(compile(xsd)).toBeDefined();
        });
    });
});
