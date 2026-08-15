import { XMLParserImpl } from "@lib/xml/parser";
import { SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { ComplexTypeDefinition, CompiledSchema, ElementDeclaration, SimpleTypeDefinition } from "@lib/types/component-graph";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
import { SchemaCompilationError, SchemaError } from "@lib/types/schema-error";

const compiler = new SchemaCompilerImpl(new XMLParserImpl());

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

describe("SchemaCompiler — two-phase core (CHK-008)", () => {

    describe("minimal compile/validate round trip surface", () => {

        it("compiles a global element with an inline complex type", () => {
            const schema = compiler.compile(MINIMAL_XSD);
            const grammar = schema.grammars.get("");
            expect(grammar).toBeDefined();

            const root = grammar!.elements.get("root");
            expect(root).toBeDefined();
            expect(root!.scope).toBe("global");
            expect(root!.name).toEqual({ namespaceURI: null, localName: "root" });
            expect(root!.typeRef).toBeNull();

            const type = root!.type;
            expect(type?.kind).toBe("complex-type");
            const complex = type as ComplexTypeDefinition;
            expect(complex.contentType).toBe("element-only");
            expect(complex.particle).not.toBeNull();
            expect(complex.particle!.term.kind).toBe("sequence");
        });

        it("resolves local element type references against built-in types", () => {
            const schema = compiler.compile(MINIMAL_XSD);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type as ComplexTypeDefinition;
            const group = complex.particle!.term;
            if (group.kind !== "sequence") throw new Error("expected a sequence content model");
            const children = group.particles;

            const foo = children[0]!.term as ElementDeclaration;
            expect(foo.name).toEqual({ namespaceURI: null, localName: "foo" });
            expect(foo.typeRef).toEqual({ namespaceURI: NAMESPACE_XSD, localName: "string" });
            expect(foo.type?.kind).toBe("simple-type");
            expect((foo.type as { name: { localName: string } | null }).name?.localName).toBe("string");

            const bar = children[1]!.term as ElementDeclaration;
            expect(bar.name).toEqual({ namespaceURI: null, localName: "bar" });
            expect(bar.type).toBeDefined();
        });

        it("returns a deeply frozen, immutable compiled schema", () => {
            const schema = compiler.compile(MINIMAL_XSD);
            expect(Object.isFrozen(schema)).toBe(true);
            expect(Object.isFrozen(schema.grammars)).toBe(true);

            const grammar = schema.grammars.get("")!;
            expect(Object.isFrozen(grammar)).toBe(true);
            expect(Object.isFrozen(grammar.elements)).toBe(true);
            expect(Object.isFrozen(grammar.types)).toBe(true);

            const root = grammar.elements.get("root")!;
            expect(Object.isFrozen(root)).toBe(true);
            const complex = root.type as ComplexTypeDefinition;
            expect(Object.isFrozen(complex)).toBe(true);
            expect(Object.isFrozen(complex.particle!.term)).toBe(true);
        });

        it("compiles the same document twice into equivalent schemas", () => {
            const a = compiler.compile(MINIMAL_XSD);
            const b = compiler.compile(MINIMAL_XSD);
            expect(a.grammars.get("")!.elements.get("root")).toBeDefined();
            expect(b.grammars.get("")!.elements.get("root")).toBeDefined();
            expect(a.grammars.get("")!.elements.get("root")).not.toBe(b.grammars.get("")!.elements.get("root"));
        });

    });

    describe("named types and eager multi-pass resolution", () => {

        it("resolves forward references to named types declared later in the document", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root" type="RootType"/>
                    <xsd:complexType name="RootType">
                        <xsd:sequence>
                            <xsd:element name="child" type="ChildType"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:simpleType name="ChildType">
                        <xsd:restriction base="xsd:string"/>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            expect(root.typeRef).toEqual({ namespaceURI: null, localName: "RootType" });
            expect(root.type?.kind).toBe("complex-type");

            const complex = root.type as ComplexTypeDefinition;
            const group = complex.particle!.term;
            if (group.kind !== "sequence") throw new Error("expected a sequence");
            const child = group.particles[0]!.term as ElementDeclaration;
            expect(child.typeRef).toEqual({ namespaceURI: null, localName: "ChildType" });
            expect(child.type?.kind).toBe("simple-type");
        });

        it("registers named types in the grammar keyed by local name", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyString">
                        <xsd:restriction base="xsd:string"/>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const type = schema.grammars.get("")!.types.get("MyString");
            expect(type?.kind).toBe("simple-type");
            expect((type as { name: { localName: string } }).name.localName).toBe("MyString");
        });

        it("resolves every common built-in type reference", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="b" type="xsd:int"/>
                                <xsd:element name="c" type="xsd:date"/>
                                <xsd:element name="d" type="xsd:decimal"/>
                                <xsd:element name="e" type="xsd:boolean"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type as ComplexTypeDefinition;
            const group = complex.particle!.term;
            if (group.kind !== "sequence") throw new Error("expected a sequence");
            const particles = group.particles;
            for (const particle of particles) {
                const term = particle.term as ElementDeclaration;
                expect(term.type?.kind).toBe("simple-type");
            }
        });

        it("reports an unresolvable type reference through the listener and throws", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root" type="MissingType"/>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);

            expect(seen).toHaveLength(1);
            expect(seen[0]!.code).toBe("UNRESOLVED_TYPE");
            expect(seen[0]!.severity).toBe("error");
            expect(seen[0]!.phase).toBe("schema-compilation");
            expect(seen[0]!.message).toContain("MissingType");
            expect(seen[0]!.location.line).toBeGreaterThan(0);
            expect(seen[0]!.location.column).toBeGreaterThan(0);
        });

        it("reports an unresolvable built-in type in a nested element and throws", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="child" type="xsd:notAType"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_TYPE")).toBe(true);
        });

        it("reports an unresolvable restriction base in a named simple type", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Broken">
                        <xsd:restriction base="Nope"/>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_TYPE" && e.message.includes("Nope"))).toBe(true);
        });

        it("throws SchemaCompilationError carrying the reported errors", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root" type="MissingA"/>
                    <xsd:element name="other" type="MissingB"/>
                </xsd:schema>
            `;
            try {
                compiler.compile(xsd);
                fail("expected compile to throw");
            } catch (err) {
                expect(err).toBeInstanceOf(SchemaCompilationError);
                const compileError = err as SchemaCompilationError;
                expect(compileError.errors).toHaveLength(2);
                expect(compileError.errors.every((e) => e.code === "UNRESOLVED_TYPE")).toBe(true);
            }
        });

    });

    describe("namespaces and forms", () => {

        it("registers global components under the target namespace", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:foo">
                    <xsd:element name="root">
                        <xsd:complexType/>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            expect(schema.grammars.get("urn:foo")).toBeDefined();
            const root = schema.grammars.get("urn:foo")!.elements.get("root");
            expect(root?.name).toEqual({ namespaceURI: "urn:foo", localName: "root" });
        });

        it("keeps local elements unqualified by default", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:foo">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="child" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("urn:foo")!.elements.get("root")!;
            const complex = root.type as ComplexTypeDefinition;
            const group = complex.particle!.term;
            if (group.kind !== "sequence") throw new Error("expected a sequence");
            const child = group.particles[0]!.term as ElementDeclaration;
            expect(child?.name).toEqual({ namespaceURI: null, localName: "child" });
        });

        it("qualifies local elements when elementFormDefault is qualified", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:foo" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="child" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("urn:foo")!.elements.get("root")!;
            const complex = root.type as ComplexTypeDefinition;
            const child = complex.particle!.term.kind === "sequence"
                ? complex.particle!.term.particles[0]!.term as ElementDeclaration
                : null;
            expect(child?.name).toEqual({ namespaceURI: "urn:foo", localName: "child" });
        });

        it("resolves prefixed type references via in-scope namespace declarations", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" xmlns:t="urn:foo" targetNamespace="urn:foo">
                    <xsd:element name="root" type="t:SharedType"/>
                    <xsd:simpleType name="SharedType">
                        <xsd:restriction base="xsd:string"/>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("urn:foo")!.elements.get("root")!;
            expect(root.typeRef).toEqual({ namespaceURI: "urn:foo", localName: "SharedType" });
            expect(root.type?.kind).toBe("simple-type");
        });

        it("treats an unresolvable prefix as an unresolved reference", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" xmlns:t="urn:types">
                    <xsd:element name="root" type="t:MissingType"/>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_TYPE" && e.message.includes("MissingType"))).toBe(true);
        });

    });

    describe("error taxonomy", () => {

        it("reports a fatal INVALID_SCHEMA_DOCUMENT error and throws for malformed XML", () => {
            const seen: SchemaError[] = [];
            expect(() => compiler.compile("<root><unclosed></root>", { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen[0]!.code).toBe("INVALID_SCHEMA_DOCUMENT");
            expect(seen[0]!.severity).toBe("fatal");
            expect(seen[0]!.phase).toBe("schema-compilation");
        });

        it("reports a fatal error when the root is not xs:schema", () => {
            const seen: SchemaError[] = [];
            expect(() => compiler.compile("<notSchema/>", { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen[0]!.code).toBe("INVALID_SCHEMA_DOCUMENT");
        });

        it("reports unsupported constructs as warnings and still compiles", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:any processContents="lax"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            const schema: CompiledSchema = compiler.compile(xsd, { listener: (e) => seen.push(e) });
            expect(seen.length).toBeGreaterThan(0);
            expect(seen.every((e) => e.severity === "warning" && e.code === "UNSUPPORTED_FEATURE")).toBe(true);
            expect(schema.grammars.get("")!.elements.get("root")).toBeDefined();
        });

        it("reports an attribute whose type must be simple", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute name="bad" type="xsd:anyType"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_TYPE" && e.message.includes("simple type"))).toBe(true);
        });

    });

    describe("simple type facets (CHK-010)", () => {

        it("compiles a global simpleType restriction with facets", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyString">
                        <xsd:restriction base="xsd:string">
                            <xsd:minLength value="2"/>
                            <xsd:maxLength value="10"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MyString"/>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const grammar = schema.grammars.get("")!;
            const myString = grammar.types.get("MyString") as SimpleTypeDefinition;
            expect(myString).toBeDefined();
            expect(myString.variety).toBe("atomic");
            expect(myString.facets).toHaveLength(2);
            expect(myString.facets.map((f) => f.kind).sort()).toEqual(["maxLength", "minLength"]);
        });

        it("inherits whiteSpace from the base type (xsd:string → preserve)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyString">
                        <xsd:restriction base="xsd:string">
                            <xsd:minLength value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const st = schema.grammars.get("")!.types.get("MyString") as SimpleTypeDefinition;
            expect(st.whiteSpace).toBe("preserve");
        });

        it("inherits whiteSpace from xsd:normalizedString → replace", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Mine">
                        <xsd:restriction base="xsd:normalizedString">
                            <xsd:maxLength value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const st = schema.grammars.get("")!.types.get("Mine") as SimpleTypeDefinition;
            expect(st.whiteSpace).toBe("replace");
        });

        it("inherits whiteSpace from xsd:token → collapse", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Mine">
                        <xsd:restriction base="xsd:token">
                            <xsd:length value="3"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const st = schema.grammars.get("")!.types.get("Mine") as SimpleTypeDefinition;
            expect(st.whiteSpace).toBe("collapse");
        });

        it("resolves the base type reference for a restriction", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="BaseType">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:simpleType name="DerivedType">
                        <xsd:restriction base="BaseType">
                            <xsd:maxLength value="10"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const base = schema.grammars.get("")!.types.get("BaseType") as SimpleTypeDefinition;
            const derived = schema.grammars.get("")!.types.get("DerivedType") as SimpleTypeDefinition;
            expect(derived.baseType).toBe(base);
            // Derived inherits length=5 from base, and has maxLength=10
            const eff = derived.effectiveFacets;
            expect(eff.find((f) => f.kind === "length")?.value).toBe("5");
            expect(eff.find((f) => f.kind === "maxLength")?.value).toBe("10");
        });

        it("inline simpleType under an element gets facets resolved", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="e">
                        <xsd:simpleType>
                            <xsd:restriction base="xsd:string">
                                <xsd:minLength value="1"/>
                            </xsd:restriction>
                        </xsd:simpleType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const e = schema.grammars.get("")!.elements.get("e")!;
            const st = e.type as SimpleTypeDefinition;
            expect(st.kind).toBe("simple-type");
            expect(st.effectiveFacets.find((f) => f.kind === "minLength")?.value).toBe("1");
            // Inherits whiteSpace from string
            expect(st.whiteSpace).toBe("preserve");
        });

        it("facets include enumeration when present", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Color">
                        <xsd:restriction base="xsd:string">
                            <xsd:enumeration value="red"/>
                            <xsd:enumeration value="green"/>
                            <xsd:enumeration value="blue"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const st = schema.grammars.get("")!.types.get("Color") as SimpleTypeDefinition;
            const enums = st.effectiveFacets.filter((f) => f.kind === "enumeration");
            expect(enums).toHaveLength(3);
        });

    });

});
