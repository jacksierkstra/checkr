import { XMLParserImpl } from "@lib/xml/parser";
import { SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { ComplexTypeDefinition, CompiledSchema, ElementDeclaration, ModelGroup, SimpleTypeDefinition, Wildcard } from "@lib/types/component-graph";
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

        it("compiles xs:any and xs:anyAttribute without unsupported-feature warnings (CHK-021)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:any processContents="lax" namespace="##other"/>
                            </xsd:sequence>
                            <xsd:anyAttribute namespace="urn:extra" processContents="skip"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            const schema: CompiledSchema = compiler.compile(xsd, { listener: (e) => seen.push(e) });
            expect(seen).toHaveLength(0);
            const decl = schema.grammars.get("urn:t")!.elements.get("root")!;
            const type = decl.type as ComplexTypeDefinition;
            const seq = type.particle!.term as ModelGroup;
            expect(seq.particles[0]!.term.kind).toBe("wildcard");
            expect(type.attributeWildcard).not.toBeNull();
            expect((type.attributeWildcard!.namespaceConstraint as { kind: "uris"; uris: ReadonlySet<string> }).uris.has("urn:extra")).toBe(true);
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

    describe("QName resolution and refs (CHK-017)", () => {

        it("registers global attribute declarations in the grammar keyed by QName", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:attrs">
                    <xsd:attribute name="id" type="xsd:string"/>
                    <xsd:attribute name="count" type="xsd:integer"/>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const grammar = schema.grammars.get("urn:attrs")!;
            expect(grammar.attributes.get("id")).toBeDefined();
            expect(grammar.attributes.get("count")).toBeDefined();
            expect(grammar.attributes.get("id")!.name).toEqual({ namespaceURI: "urn:attrs", localName: "id" });
        });

        it("resolves a local element ref= to the referenced global declaration at compile time", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="child"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="child" type="xsd:string"/>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type as ComplexTypeDefinition;
            const group = complex.particle!.term;
            if (group.kind !== "sequence") throw new Error("expected a sequence");
            const term = group.particles[0]!.term as ElementDeclaration;
            // The ref particle carries the referenced QName and resolves to the
            // global declaration's type (xsd:string), not anyType.
            expect(term.ref).toEqual({ namespaceURI: null, localName: "child" });
            expect(term.name).toEqual({ namespaceURI: null, localName: "child" });
            expect(term.type?.kind).toBe("simple-type");
            expect((term.type as { name: { localName: string } | null }).name?.localName).toBe("string");
        });

        it("resolves forward ref= references to global elements declared later", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="later"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="later" type="xsd:integer"/>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type as ComplexTypeDefinition;
            const group = complex.particle!.term;
            if (group.kind !== "sequence") throw new Error("expected a sequence");
            const term = group.particles[0]!.term as ElementDeclaration;
            expect((term.type as { name: { localName: string } | null }).name?.localName).toBe("integer");
        });

        it("resolves a ref= written with an explicit prefix bound to the target namespace", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" xmlns:c="urn:co" targetNamespace="urn:co">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="c:child"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="child" type="xsd:string"/>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("urn:co")!.elements.get("root")!;
            const complex = root.type as ComplexTypeDefinition;
            const group = complex.particle!.term;
            if (group.kind !== "sequence") throw new Error("expected a sequence");
            const term = group.particles[0]!.term as ElementDeclaration;
            expect(term.ref).toEqual({ namespaceURI: "urn:co", localName: "child" });
            expect(term.type?.kind).toBe("simple-type");
        });

        it("resolves an attribute ref= to the referenced global declaration", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:attribute name="lang" type="xsd:string"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute ref="lang" use="required"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type as ComplexTypeDefinition;
            const use = complex.attributeUses[0]!;
            expect(use.required).toBe(true);
            expect(use.declaration.ref).toEqual({ namespaceURI: null, localName: "lang" });
            expect(use.declaration.type?.kind).toBe("simple-type");
            expect((use.declaration.type as { name: { localName: string } | null }).name?.localName).toBe("string");
        });

        it("reports an unresolved element ref= as a compile error", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="MissingElement"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_REFERENCE" && e.message.includes("MissingElement"))).toBe(true);
        });

        it("reports an unresolved attribute ref= as a compile error", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute ref="MissingAttr"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_REFERENCE" && e.message.includes("MissingAttr"))).toBe(true);
        });

        it("type= reference resolution carries the full type content (children, attributes, facets)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Size">
                        <xsd:restriction base="xsd:string">
                            <xsd:enumeration value="small"/>
                            <xsd:enumeration value="large"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:complexType name="Item">
                        <xsd:sequence>
                            <xsd:element name="name" type="xsd:string"/>
                        </xsd:sequence>
                        <xsd:attribute name="size" type="Size"/>
                    </xsd:complexType>
                    <xsd:element name="item" type="Item"/>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const item = schema.grammars.get("")!.elements.get("item")!;
            const complex = item.type as ComplexTypeDefinition;
            expect(complex.contentType).toBe("element-only");
            // Children carried through the type reference.
            const group = complex.particle!.term;
            if (group.kind !== "sequence") throw new Error("expected a sequence");
            expect(group.particles).toHaveLength(1);
            // Attributes carried through the type reference, with facets on
            // the attribute's own simple type (not dropped, per the gap analysis).
            const use = complex.attributeUses[0]!;
            expect(use.declaration.name.localName).toBe("size");
            const enums = use.declaration.type!.effectiveFacets.filter((f) => f.kind === "enumeration");
            expect(enums).toHaveLength(2);
        });

    });

    describe("list and union types (CHK-016)", () => {

        it("compiles a list type and resolves its item type definition", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="IntList">
                        <xsd:list itemType="xsd:integer"/>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const st = schema.grammars.get("")!.types.get("IntList") as SimpleTypeDefinition;
            expect(st.variety).toBe("list");
            expect(st.itemType).toEqual({ namespaceURI: NAMESPACE_XSD, localName: "integer" });
            expect(st.itemTypeDef?.name?.localName).toBe("integer");
            // A list's whiteSpace is fixed to collapse (XSD 1.0 §3.4.1).
            expect(st.whiteSpace).toBe("collapse");
            // The item type's facets are NOT inherited by the list itself.
            expect(st.effectiveFacets).toHaveLength(0);
        });

        it("compiles a list with an inline anonymous item type", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="TwoCharTokens">
                        <xsd:list>
                            <xsd:simpleType>
                                <xsd:restriction base="xsd:token">
                                    <xsd:length value="2"/>
                                </xsd:restriction>
                            </xsd:simpleType>
                        </xsd:list>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const st = schema.grammars.get("")!.types.get("TwoCharTokens") as SimpleTypeDefinition;
            expect(st.variety).toBe("list");
            expect(st.itemType).toBeNull();
            expect(st.itemTypeDef).not.toBeNull();
            expect(st.itemTypeDef!.name).toBeNull(); // anonymous
            expect(st.itemTypeDef!.effectiveFacets.find((f) => f.kind === "length")?.value).toBe("2");
        });

        it("resolves union memberTypes and keeps inline members in order", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="TokenOrTwo">
                        <xsd:union memberTypes="xsd:token">
                            <xsd:simpleType>
                                <xsd:restriction base="xsd:string">
                                    <xsd:length value="2"/>
                                </xsd:restriction>
                            </xsd:simpleType>
                        </xsd:union>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const st = schema.grammars.get("")!.types.get("TokenOrTwo") as SimpleTypeDefinition;
            expect(st.variety).toBe("union");
            expect(st.memberTypeDefs).toHaveLength(2);
            expect(st.memberTypeDefs[0]!.name?.localName).toBe("token");
            expect(st.memberTypeDefs[1]!.name).toBeNull(); // inline member
        });

        it("resolves forward references in memberTypes", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="LaterOrNow">
                        <xsd:union memberTypes="Later"/>
                    </xsd:simpleType>
                    <xsd:simpleType name="Later">
                        <xsd:restriction base="xsd:string"/>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const st = schema.grammars.get("")!.types.get("LaterOrNow") as SimpleTypeDefinition;
            expect(st.memberTypeDefs).toHaveLength(1);
            expect(st.memberTypeDefs[0]!.name?.localName).toBe("Later");
        });

        it("a restriction of a list type is itself a list with the base's item type", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="IntList">
                        <xsd:list itemType="xsd:integer"/>
                    </xsd:simpleType>
                    <xsd:simpleType name="TwoInts">
                        <xsd:restriction base="IntList">
                            <xsd:length value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const two = schema.grammars.get("")!.types.get("TwoInts") as SimpleTypeDefinition;
            expect(two.variety).toBe("list");
            expect(two.baseType?.name?.localName).toBe("IntList");
            expect(two.itemTypeDef?.name?.localName).toBe("integer");
            expect(two.effectiveFacets.find((f) => f.kind === "length")?.value).toBe("2");
        });

        it("a restriction of a union type is itself a union with the base's members", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="IntOrDate">
                        <xsd:union memberTypes="xsd:integer xsd:date"/>
                    </xsd:simpleType>
                    <xsd:simpleType name="RestrictedUnion">
                        <xsd:restriction base="IntOrDate">
                            <xsd:enumeration value="2020"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const ru = schema.grammars.get("")!.types.get("RestrictedUnion") as SimpleTypeDefinition;
            expect(ru.variety).toBe("union");
            expect(ru.memberTypeDefs.map((m) => m.name?.localName)).toEqual(["integer", "date"]);
            expect(ru.effectiveFacets.find((f) => f.kind === "enumeration")?.value).toBe("2020");
        });

        it("reports an error when a list item type is not a simple type", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="NotSimple"/>
                    <xsd:simpleType name="BrokenList">
                        <xsd:list itemType="NotSimple"/>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_TYPE" && e.message.includes("List item"))).toBe(true);
        });

        it("reports an error when a union member type is not a simple type", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="NotSimple"/>
                    <xsd:simpleType name="BrokenUnion">
                        <xsd:union memberTypes="NotSimple"/>
                    </xsd:simpleType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_TYPE" && e.message.includes("Union member"))).toBe(true);
        });

    });

    describe("all-group occurrence limits (CHK-018)", () => {

        it("rejects xs:all with maxOccurs=2 at compile time", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="BadAll">
                        <xsd:all maxOccurs="2">
                            <xsd:element name="a"/>
                        </xsd:all>
                    </xsd:complexType>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).toThrow("Schema compilation failed");
        });

        it("rejects xs:all with maxOccurs=unbounded at compile time", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="BadAll">
                        <xsd:all maxOccurs="unbounded">
                            <xsd:element name="a"/>
                        </xsd:all>
                    </xsd:complexType>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).toThrow("Schema compilation failed");
        });

        it("rejects xs:all with minOccurs=2 at compile time", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="BadAll">
                        <xsd:all minOccurs="2">
                            <xsd:element name="a"/>
                        </xsd:all>
                    </xsd:complexType>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).toThrow("Schema compilation failed");
        });

        it("accepts xs:all with valid occurrence (minOccurs=0, maxOccurs=1)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="GoodAll">
                        <xsd:all minOccurs="0">
                            <xsd:element name="a"/>
                        </xsd:all>
                    </xsd:complexType>
                    <xsd:element name="e" type="GoodAll"/>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).not.toThrow();
        });

        it("rejects xs:all child with maxOccurs > 1 at compile time", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="BadAll">
                        <xsd:all>
                            <xsd:element name="a" maxOccurs="2"/>
                        </xsd:all>
                    </xsd:complexType>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).toThrow("Schema compilation failed");
        });

    });

    describe("UPA determinism (CHK-018)", () => {

        it("rejects a choice with overlapping element names", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:choice>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="a" type="xsd:string"/>
                            </xsd:choice>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).toThrow("Schema compilation failed");
        });

        it("rejects a sequence with nullable-first overlapping particle", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string" minOccurs="0"/>
                                <xsd:element name="a" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).toThrow("Schema compilation failed");
        });

        it("rejects a sequence with repeatable-first overlapping particle", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string" maxOccurs="unbounded"/>
                                <xsd:element name="a" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).toThrow("Schema compilation failed");
        });

        it("accepts a sequence with non-nullable non-repeatable overlapping elements (UPA-val)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="a" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).not.toThrow();
        });

        it("accepts a sequence with an optional separator between same-named elements", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string" maxOccurs="1"/>
                                <xsd:element name="b" type="xsd:string" minOccurs="0"/>
                                <xsd:element name="a" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).not.toThrow();
        });

        it("accepts a determinstic choice (disjoint element names)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:choice>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="b" type="xsd:string"/>
                            </xsd:choice>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).not.toThrow();
        });

        it("rejects an all-group with overlapping element names", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="BadAll">
                        <xsd:all>
                            <xsd:element name="a"/>
                            <xsd:element name="a"/>
                        </xsd:all>
                    </xsd:complexType>
                    <xsd:element name="e" type="BadAll"/>
                </xsd:schema>
            `;
            expect(() => compiler.compile(xsd)).toThrow("Schema compilation failed");
        });

        it("reports AMBIGUOUS_CONTENT_MODEL error code for UPA violations", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:choice>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="a" type="xsd:string"/>
                            </xsd:choice>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const errors: SchemaError[] = [];
            try {
                compiler.compile(xsd, { listener: (e) => errors.push(e) });
            } catch {}
            expect(errors.some((e) => e.code === "AMBIGUOUS_CONTENT_MODEL")).toBe(true);
        });

    });

});

describe("named model groups and attribute groups (CHK-019)", () => {

    describe("model group definitions", () => {

        it("compiles a global model group definition and registers it in the grammar", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:group name="G">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                            <xsd:element name="b" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:group>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const grammar = schema.grammars.get("")!;
            const def = grammar.modelGroups.get("G");
            expect(def).toBeDefined();
            expect(def!.kind).toBe("model-group-definition");
            expect(def!.name).toEqual({ namespaceURI: null, localName: "G" });
            expect(def!.particle.term.kind).toBe("sequence");
        });

        it("expands a group ref inside a complex type into the referenced particles", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:group name="G">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                            <xsd:element name="b" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:group>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:group ref="G"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type! as ComplexTypeDefinition;
            // The outer sequence is the complex type's particle term.
            const outerSeq = complex.particle!.term! as ModelGroup;
            expect(outerSeq.kind).toBe("sequence");
            // The ref particle wraps the group: one child carrying the expanded content.
            const refParticle = outerSeq.particles[0]!;
            const expandedGroup = refParticle.term! as ModelGroup;
            expect(expandedGroup.kind).toBe("sequence");
            expect(expandedGroup.particles).toHaveLength(2);
            expect((expandedGroup.particles[0]!.term as ElementDeclaration).name.localName).toBe("a");
            expect((expandedGroup.particles[1]!.term as ElementDeclaration).name.localName).toBe("b");
        });

        it("resolves forward references to model groups", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:group ref="Later"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:group name="Later">
                        <xsd:choice>
                            <xsd:element name="x" type="xsd:string"/>
                        </xsd:choice>
                    </xsd:group>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type! as ComplexTypeDefinition;
            const outerSeq = complex.particle!.term! as ModelGroup;
            const refParticle = outerSeq.particles[0]!;
            const expandedGroup = refParticle.term! as ModelGroup;
            expect(expandedGroup.kind).toBe("choice");
            expect(expandedGroup.particles).toHaveLength(1);
        });

        it("honors the ref particle's minOccurs/maxOccurs", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:group name="G">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:group>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:group ref="G" minOccurs="0" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type! as ComplexTypeDefinition;
            const outerSeq = complex.particle!.term! as ModelGroup;
            // The group ref particle with min=0/max=unbounded
            const refParticle = outerSeq.particles[0]!;
            expect(refParticle.minOccurs).toBe(0);
            expect(refParticle.maxOccurs).toBe("unbounded");
            // The expanded content is the term of that ref particle
            const expandedGroup = refParticle.term! as ModelGroup;
            expect(expandedGroup.kind).toBe("sequence");
            expect(expandedGroup.particles).toHaveLength(1);
        });

        it("reports UNRESOLVED_REFERENCE for a missing group ref", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:group ref="Missing"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_REFERENCE" && e.message.includes("Missing"))).toBe(true);
        });

        it("reports CIRCULAR_REFERENCE for directly circular model groups", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:group name="G">
                        <xsd:sequence>
                            <xsd:group ref="G"/>
                        </xsd:sequence>
                    </xsd:group>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "CIRCULAR_REFERENCE")).toBe(true);
        });

        it("reports CIRCULAR_REFERENCE for transitively circular model groups", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:group name="G1">
                        <xsd:sequence>
                            <xsd:group ref="G2"/>
                        </xsd:sequence>
                    </xsd:group>
                    <xsd:group name="G2">
                        <xsd:sequence>
                            <xsd:group ref="G1"/>
                        </xsd:sequence>
                    </xsd:group>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "CIRCULAR_REFERENCE")).toBe(true);
        });

        it("nested group refs inside model groups resolve correctly", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:group name="A">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:group>
                    <xsd:group name="B">
                        <xsd:sequence>
                            <xsd:group ref="A"/>
                            <xsd:element name="b" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:group>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:group ref="B"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type! as ComplexTypeDefinition;
            const outerSeq = complex.particle!.term! as ModelGroup;
            const refB = outerSeq.particles[0]!;
            const expandedB = refB.term! as ModelGroup;
            expect(expandedB.kind).toBe("sequence");
            // B's particles: [ref A (wrapper), element b]
            expect(expandedB.particles).toHaveLength(2);
            // Particle 0 is the wrapped ref to A
            const innerRefA = expandedB.particles[0]!;
            const expandedA = innerRefA.term! as ModelGroup;
            expect(expandedA.kind).toBe("sequence");
            expect(expandedA.particles).toHaveLength(1);
            expect((expandedA.particles[0]!.term as ElementDeclaration).name.localName).toBe("a");
            // Particle 1 is the direct element b
            expect((expandedB.particles[1]!.term as ElementDeclaration).name.localName).toBe("b");
        });

    });

    describe("attribute group definitions", () => {

        it("compiles a global attribute group definition and registers it in the grammar", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:attributeGroup name="AG">
                        <xsd:attribute name="id" type="xsd:string"/>
                        <xsd:attribute name="lang" type="xsd:string"/>
                    </xsd:attributeGroup>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const grammar = schema.grammars.get("")!;
            const def = grammar.attributeGroups.get("AG");
            expect(def).toBeDefined();
            expect(def!.kind).toBe("attribute-group-definition");
            expect(def!.name).toEqual({ namespaceURI: null, localName: "AG" });
            expect(def!.attributeUses).toHaveLength(2);
        });

        it("expands an attribute group ref inside a complex type", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:attributeGroup name="AG">
                        <xsd:attribute name="id" type="xsd:string" use="required"/>
                        <xsd:attribute name="lang" type="xsd:string"/>
                    </xsd:attributeGroup>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attributeGroup ref="AG"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type! as ComplexTypeDefinition;
            expect(complex.attributeUses).toHaveLength(2);
            // The id attribute should be required (from the group)
            const idUse = complex.attributeUses.find((u) => u.declaration.name.localName === "id")!;
            expect(idUse.required).toBe(true);
            expect(idUse.declaration.type?.kind).toBe("simple-type");
        });

        it("resolves forward references to attribute groups", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attributeGroup ref="Later"/>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:attributeGroup name="Later">
                        <xsd:attribute name="code" type="xsd:string" use="required"/>
                    </xsd:attributeGroup>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type! as ComplexTypeDefinition;
            expect(complex.attributeUses).toHaveLength(1);
            expect(complex.attributeUses[0]!.declaration.name.localName).toBe("code");
            expect(complex.attributeUses[0]!.required).toBe(true);
        });

        it("expands nested attribute group refs", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:attributeGroup name="BaseAG">
                        <xsd:attribute name="baseAttr" type="xsd:string"/>
                    </xsd:attributeGroup>
                    <xsd:attributeGroup name="ExtendedAG">
                        <xsd:attributeGroup ref="BaseAG"/>
                        <xsd:attribute name="extAttr" type="xsd:int"/>
                    </xsd:attributeGroup>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attributeGroup ref="ExtendedAG"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const root = schema.grammars.get("")!.elements.get("root")!;
            const complex = root.type! as ComplexTypeDefinition;
            expect(complex.attributeUses).toHaveLength(2);
            const names = complex.attributeUses.map((u) => u.declaration.name.localName).sort();
            expect(names).toEqual(["baseAttr", "extAttr"]);
        });

        it("reports UNRESOLVED_REFERENCE for a missing attribute group ref", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attributeGroup ref="MissingAG"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "UNRESOLVED_REFERENCE" && e.message.includes("MissingAG"))).toBe(true);
        });

        it("reports CIRCULAR_REFERENCE for circular attribute groups", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:attributeGroup name="AG1">
                        <xsd:attributeGroup ref="AG2"/>
                    </xsd:attributeGroup>
                    <xsd:attributeGroup name="AG2">
                        <xsd:attributeGroup ref="AG1"/>
                    </xsd:attributeGroup>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "CIRCULAR_REFERENCE")).toBe(true);
        });

        it("reports a duplicate attribute after expansion", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:attributeGroup name="AG">
                        <xsd:attribute name="x" type="xsd:string"/>
                    </xsd:attributeGroup>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attributeGroup ref="AG"/>
                            <xsd:attribute name="x" type="xsd:string"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT" && e.message.includes("x"))).toBe(true);
        });

    });

    describe("model group definitions with UPA (CHK-018 integration)", () => {

        it("reports UPA violation in a model group definition", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:group name="G">
                        <xsd:choice>
                            <xsd:element name="a" type="xsd:string"/>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:choice>
                    </xsd:group>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "AMBIGUOUS_CONTENT_MODEL")).toBe(true);
        });

        it("rejects an all-group with a group ref inside (XSD 1.0 restriction)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:group name="G">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:group>
                    <xsd:complexType name="Bad">
                        <xsd:all>
                            <xsd:group ref="G"/>
                        </xsd:all>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT" &&
                e.message.includes("all"))).toBe(true);
        });

    });

});

describe("complex content derivation (CHK-020)", () => {

    describe("complexContent extension", () => {

        it("splices base particle and new particle into a sequence", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Base">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:extension base="Base">
                                <xsd:sequence>
                                    <xsd:element name="b" type="xsd:int"/>
                                </xsd:sequence>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                    <xsd:element name="root" type="Derived"/>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const derived = schema.grammars.get("")!.types.get("Derived") as ComplexTypeDefinition;
            expect(derived.derivationMethod).toBe("extension");
            expect(derived.baseType!.name!).toEqual({ namespaceURI: null, localName: "Base" });
            expect(derived.contentType).toBe("element-only");
            // Effective particle is a sequence with base particle then new particle
            const particle = derived.particle!;
            expect(particle.term.kind).toBe("sequence");
            const group = particle.term as ModelGroup;
            expect(group.particles).toHaveLength(2);
            const baseGroup = group.particles[0]!.term as ModelGroup;
            const childA = baseGroup.particles[0]!.term as ElementDeclaration;
            expect(childA.name.localName).toBe("a");
            const newGroup = group.particles[1]!.term as ModelGroup;
            const childB = newGroup.particles[0]!.term as ElementDeclaration;
            expect(childB.name.localName).toBe("b");
        });

        it("inherits base attributes and adds new ones", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Base">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                        <xsd:attribute name="lang" type="xsd:string"/>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:extension base="Base">
                                <xsd:sequence>
                                    <xsd:element name="b" type="xsd:int"/>
                                </xsd:sequence>
                                <xsd:attribute name="newAttr" type="xsd:int"/>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const derived = schema.grammars.get("")!.types.get("Derived") as ComplexTypeDefinition;
            const attrNames = derived.attributeUses.map((u) => u.declaration.name.localName);
            expect(attrNames).toContain("lang");
            expect(attrNames).toContain("newAttr");
            expect(attrNames.indexOf("lang")).toBeLessThan(attrNames.indexOf("newAttr"));
        });

        it("reports INVALID_EXTENSION when an attribute name clashes with the base", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Base">
                        <xsd:attribute name="dup" type="xsd:string"/>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:extension base="Base">
                                <xsd:attribute name="dup" type="xsd:int"/>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_EXTENSION" && e.message.includes("dup"))).toBe(true);
        });

        it("reports INVALID_EXTENSION when extending a simple-content type with complexContent", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="S">
                        <xsd:simpleContent>
                            <xsd:extension base="xsd:string"/>
                        </xsd:simpleContent>
                    </xsd:complexType>
                    <xsd:complexType name="D">
                        <xsd:complexContent>
                            <xsd:extension base="S">
                                <xsd:sequence>
                                    <xsd:element name="x" type="xsd:string"/>
                                </xsd:sequence>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_EXTENSION")).toBe(true);
        });

        it("sets contentType to element-only when extending an empty base with a particle", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Empty"/>
                    <xsd:complexType name="D">
                        <xsd:complexContent>
                            <xsd:extension base="Empty">
                                <xsd:sequence>
                                    <xsd:element name="a" type="xsd:string"/>
                                </xsd:sequence>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const d = schema.grammars.get("")!.types.get("D") as ComplexTypeDefinition;
            expect(d.contentType).toBe("element-only");
        });

        it("throws on circular derivation", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="A">
                        <xsd:complexContent>
                            <xsd:extension base="B">
                                <xsd:sequence/>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                    <xsd:complexType name="B">
                        <xsd:complexContent>
                            <xsd:extension base="A">
                                <xsd:sequence/>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "CIRCULAR_DERIVATION")).toBe(true);
        });

    });

    describe("complexContent restriction", () => {

        it("validates a valid sequence-to-sequence restriction", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Base">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                            <xsd:element name="b" type="xsd:string" maxOccurs="5"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="Base">
                                <xsd:sequence>
                                    <xsd:element name="b" type="xsd:string" maxOccurs="2"/>
                                </xsd:sequence>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const derived = schema.grammars.get("")!.types.get("Derived") as ComplexTypeDefinition;
            expect(derived.derivationMethod).toBe("restriction");
            expect(derived.baseType!.name!.localName).toBe("Base");
            expect(derived.contentType).toBe("element-only");
            // The effective particle is the restriction's own particle (b, maxOccurs=2)
            const group = derived.particle!.term as ModelGroup;
            expect(group.particles).toHaveLength(1);
            expect((group.particles[0]!.term as ElementDeclaration).name.localName).toBe("b");
        });

        it("reports INVALID_RESTRICTION when a derived element has a different name", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Base">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="Base">
                                <xsd:sequence>
                                    <xsd:element name="zzz" type="xsd:string"/>
                                </xsd:sequence>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_RESTRICTION")).toBe(true);
        });

        it("reports ALL_GROUP_RESTRICTION for restriction with an all-group (CTR-all-compile)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Base">
                        <xsd:all>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:all>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="Base">
                                <xsd:all>
                                    <xsd:element name="a" type="xsd:string"/>
                                </xsd:all>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "ALL_GROUP_RESTRICTION")).toBe(true);
        });

        it("reports INVALID_RESTRICTION when a restriction introduces a content model over an empty base", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Base"/>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="Base">
                                <xsd:sequence>
                                    <xsd:element name="a" type="xsd:string"/>
                                </xsd:sequence>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_RESTRICTION" &&
                e.message.includes("cannot introduce"))).toBe(true);
        });

    });

    describe("simpleContent extension", () => {

        it("inherits the base simple type and adds attributes (directly from a simple type)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Count">
                        <xsd:simpleContent>
                            <xsd:extension base="xsd:int">
                                <xsd:attribute name="unit" type="xsd:string"/>
                            </xsd:extension>
                        </xsd:simpleContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const ct = schema.grammars.get("")!.types.get("Count") as ComplexTypeDefinition;
            expect(ct.contentType).toBe("simple");
            expect(ct.simpleType!.name!.localName).toBe("int");
            expect(ct.derivationMethod).toBe("extension");
            expect(ct.attributeUses).toHaveLength(1);
            expect(ct.attributeUses[0]!.declaration.name.localName).toBe("unit");
        });

        it("chains through a complex-with-simple-content base", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Base">
                        <xsd:simpleContent>
                            <xsd:extension base="xsd:int">
                                <xsd:attribute name="orig" type="xsd:string"/>
                            </xsd:extension>
                        </xsd:simpleContent>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:simpleContent>
                            <xsd:extension base="Base">
                                <xsd:attribute name="extra" type="xsd:string"/>
                            </xsd:extension>
                        </xsd:simpleContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const d = schema.grammars.get("")!.types.get("Derived") as ComplexTypeDefinition;
            expect(d.simpleType!.name!.localName).toBe("int");
            expect(d.attributeUses.map((u) => u.declaration.name.localName)).toEqual(["orig", "extra"]);
        });

    });

    describe("simpleContent restriction", () => {

        it("accepts a simpleContent restriction against a pure simple type with facets", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Label">
                        <xsd:simpleContent>
                            <xsd:restriction base="xsd:string">
                                <xsd:maxLength value="10"/>
                            </xsd:restriction>
                        </xsd:simpleContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const ct = schema.grammars.get("")!.types.get("Label") as ComplexTypeDefinition;
            expect(ct.contentType).toBe("simple");
            expect(ct.simpleType).not.toBeNull();
            expect(ct.simpleType!.effectiveFacets.some((f) => f.kind === "maxLength" && f.value === "10")).toBe(true);
            expect(ct.derivationMethod).toBe("restriction");
        });

        it("reports INVALID_RESTRICTION when attributes are added to a pure-simple-base restriction", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="X">
                        <xsd:simpleContent>
                            <xsd:restriction base="xsd:string">
                                <xsd:attribute name="a" type="xsd:string"/>
                            </xsd:restriction>
                        </xsd:simpleContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_RESTRICTION" &&
                e.message.includes("cannot declare attributes"))).toBe(true);
        });

        it("accepts a simpleContent restriction against a complex base with simple content and facets", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Base">
                        <xsd:simpleContent>
                            <xsd:extension base="xsd:string">
                                <xsd:attribute name="lang" type="xsd:string"/>
                            </xsd:extension>
                        </xsd:simpleContent>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:simpleContent>
                            <xsd:restriction base="Base">
                                <xsd:maxLength value="5"/>
                                <xsd:attribute name="lang" type="xsd:string"/>
                            </xsd:restriction>
                        </xsd:simpleContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const d = schema.grammars.get("")!.types.get("Derived") as ComplexTypeDefinition;
            expect(d.simpleType?.effectiveFacets.some((f) => f.kind === "maxLength" && f.value === "5")).toBe(true);
            expect(d.attributeUses).toHaveLength(1);
            expect(d.attributeUses[0]!.declaration.name.localName).toBe("lang");
        });

    });

    describe("mixed content", () => {

        it("produces contentType 'mixed' when mixed='true' on xs:complexType", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="M" mixed="true">
                        <xsd:sequence>
                            <xsd:element name="em" type="xsd:string" minOccurs="0"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const ct = schema.grammars.get("")!.types.get("M") as ComplexTypeDefinition;
            expect(ct.contentType).toBe("mixed");
        });

        it("produces contentType 'mixed' when mixed='true' with no compositor", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="M" mixed="true"/>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const ct = schema.grammars.get("")!.types.get("M") as ComplexTypeDefinition;
            expect(ct.contentType).toBe("mixed");
            expect(ct.particle).toBeNull();
        });

    });

});
describe("wildcards — namespace constraint parsing and derivation rules (CHK-021)", () => {

    it("parses a default namespace constraint as ##any", () => {
        const xsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:any/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;
        const schema = compiler.compile(xsd);
        const type = schema.grammars.get("")!.elements.get("root")!.type as ComplexTypeDefinition;
        const wc = (type.particle!.term as ModelGroup).particles[0]!.term as Wildcard;
        expect(wc.namespaceConstraint.kind).toBe("any");
    });

    it("parses ##other with the target namespace", () => {
        const xsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:any namespace="##other"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;
        const schema = compiler.compile(xsd);
        const type = schema.grammars.get("urn:t")!.elements.get("root")!.type as ComplexTypeDefinition;
        const wc = (type.particle!.term as ModelGroup).particles[0]!.term as Wildcard;
        expect(wc.namespaceConstraint).toMatchObject({ kind: "other", target: "urn:t" });
    });

    it("parses an explicit list with ##targetNamespace and ##local", () => {
        const xsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:any namespace="##targetNamespace ##local http://example.com"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;
        const schema = compiler.compile(xsd);
        const type = schema.grammars.get("urn:t")!.elements.get("root")!.type as ComplexTypeDefinition;
        const wc = (type.particle!.term as ModelGroup).particles[0]!.term as Wildcard;
        const c = wc.namespaceConstraint as { kind: "uris"; uris: ReadonlySet<string> };
        expect(c.uris.has("urn:t")).toBe(true);
        expect(c.uris.has("")).toBe(true); // ##local → ""
        expect(c.uris.has("http://example.com")).toBe(true);
    });

    it("rejects a namespace attribute mixing ##any with other tokens", () => {
        const xsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:any namespace="##any http://example.com"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;
        const seen: SchemaError[] = [];
        expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(seen.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT")).toBe(true);
    });

    describe("attribute wildcard in derivation", () => {

        it("extension unions the base and derived attribute wildcard constraints", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:anyAttribute namespace="urn:a" processContents="lax"/>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:extension base="t:Base">
                                <xsd:anyAttribute namespace="urn:b" processContents="strict"/>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const derived = schema.grammars.get("urn:t")!.types.get("Derived") as ComplexTypeDefinition;
            const c = derived.attributeWildcard!.namespaceConstraint as { kind: "uris"; uris: ReadonlySet<string> };
            // Union of {urn:a} and {urn:b}
            expect(c.uris.has("urn:a")).toBe(true);
            expect(c.uris.has("urn:b")).toBe(true);
            // processContents from the complete wildcard (the derived's own)
            expect(derived.attributeWildcard!.processContents).toBe("strict");
        });

        it("extension with an absent base wildcard keeps the derived's complete wildcard", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base"/>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:extension base="t:Base">
                                <xsd:anyAttribute namespace="urn:a" processContents="lax"/>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const derived = schema.grammars.get("urn:t")!.types.get("Derived") as ComplexTypeDefinition;
            expect(derived.attributeWildcard).not.toBeNull();
            const c = derived.attributeWildcard!.namespaceConstraint as { kind: "uris"; uris: ReadonlySet<string> };
            expect(c.uris.has("urn:a")).toBe(true);
        });

        it("extension with an absent complete wildcard inherits the base's wildcard", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:anyAttribute namespace="urn:a" processContents="lax"/>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:extension base="t:Base"/>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const derived = schema.grammars.get("urn:t")!.types.get("Derived") as ComplexTypeDefinition;
            expect(derived.attributeWildcard).not.toBeNull();
            const c = derived.attributeWildcard!.namespaceConstraint as { kind: "uris"; uris: ReadonlySet<string> };
            expect(c.uris.has("urn:a")).toBe(true);
        });

        it("restriction validates the derived wildcard is a subset of the base's", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:anyAttribute namespace="##any" processContents="lax"/>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="t:Base">
                                <xsd:anyAttribute namespace="urn:a" processContents="lax"/>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const derived = schema.grammars.get("urn:t")!.types.get("Derived") as ComplexTypeDefinition;
            expect(derived.attributeWildcard).not.toBeNull();
        });

        it("restriction rejects a non-subset wildcard", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:anyAttribute namespace="urn:a" processContents="lax"/>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="t:Base">
                                <xsd:anyAttribute namespace="urn:b" processContents="lax"/>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_RESTRICTION")).toBe(true);
        });

        it("restriction rejects a weaker processContents", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:anyAttribute namespace="##any" processContents="strict"/>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="t:Base">
                                <xsd:anyAttribute namespace="##any" processContents="skip"/>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_RESTRICTION")).toBe(true);
        });

        it("restriction may remove the base's attribute wildcard", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:anyAttribute namespace="##any" processContents="lax"/>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="t:Base"/>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            const derived = schema.grammars.get("urn:t")!.types.get("Derived") as ComplexTypeDefinition;
            expect(derived.attributeWildcard).toBeNull();
        });

    });

    describe("particle wildcard restriction", () => {

        it("a wildcard may restrict another wildcard with a subset constraint", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:sequence>
                            <xsd:any namespace="##any" processContents="lax"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="t:Base">
                                <xsd:sequence>
                                    <xsd:any namespace="urn:a" processContents="lax"/>
                                </xsd:sequence>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            expect(schema.grammars.get("urn:t")!.types.get("Derived")).toBeDefined();
        });

        it("element declaration may restrict a wildcard", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:sequence>
                            <xsd:any namespace="##any" processContents="lax"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="t:Base">
                                <xsd:sequence>
                                    <xsd:element name="a" type="xsd:string"/>
                                </xsd:sequence>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            expect(schema.grammars.get("urn:t")!.types.get("Derived")).toBeDefined();
        });

        it("a wildcard cannot restrict an element declaration", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="t:Base">
                                <xsd:sequence>
                                    <xsd:any namespace="##any" processContents="lax"/>
                                </xsd:sequence>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "INVALID_RESTRICTION")).toBe(true);
        });

    });

    describe("UPA with wildcards", () => {

        it("two overlapping wildcards report AMBIGUOUS_CONTENT_MODEL", () => {
            const xsd2 = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Ambiguous">
                        <xsd:choice>
                            <xsd:any namespace="##any" processContents="lax"/>
                            <xsd:any namespace="urn:a" processContents="lax"/>
                        </xsd:choice>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const seen: SchemaError[] = [];
            expect(() => compiler.compile(xsd2, { listener: (e) => seen.push(e) }))
                .toThrow(SchemaCompilationError);
            expect(seen.some((e) => e.code === "AMBIGUOUS_CONTENT_MODEL")).toBe(true);
        });

        it("two disjoint wildcards do not report UPA violations", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Disjoint">
                        <xsd:sequence>
                            <xsd:any namespace="urn:a" processContents="lax"/>
                            <xsd:any namespace="urn:b" processContents="lax"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compiler.compile(xsd);
            expect(schema.grammars.get("urn:t")!.types.get("Disjoint")).toBeDefined();
        });

    });

});