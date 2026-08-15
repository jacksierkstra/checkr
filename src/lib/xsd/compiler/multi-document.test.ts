import { SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { XMLParserImpl } from "@lib/xml/parser";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
import { SchemaCompilationError, SchemaError } from "@lib/types/schema-error";
import { validate } from "@lib/core/compiled";

const compiler = new SchemaCompilerImpl(new XMLParserImpl());

// ---------------------------------------------------------------------------
// Helper: in-memory resolver that maps locations to XSD content strings.
// ---------------------------------------------------------------------------

function makeResolver(
    map: Record<string, string>,
): (location: string) => string | null {
    return (loc: string) => map[loc] ?? null;
}

// ---------------------------------------------------------------------------
// xs:include — same-namespace merge
// ---------------------------------------------------------------------------

describe("xs:include — same-namespace merge (CHK-024)", () => {

    const ROOT = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element ref="included"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
            <xsd:include schemaLocation="include.xsd"/>
        </xsd:schema>
    `;

    const INCLUDED = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
            <xsd:element name="included" type="xsd:string"/>
        </xsd:schema>
    `;

    const resolve = makeResolver({ "include.xsd": INCLUDED });

    it("includes a same-namespace document and resolves its components", () => {
        const schema = compiler.compile(ROOT, { resolve });
        const grammar = schema.grammars.get("")!;
        expect(grammar.elements.has("root")).toBe(true);
        expect(grammar.elements.has("included")).toBe(true);
    });

    it("includes and validates an instance end-to-end", () => {
        const schema = compiler.compile(ROOT, { resolve });
        const result = validate(`<root><included>hello</included></root>`, schema);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it("reports an error when the included document has a different target namespace", () => {
        const BAD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:other">
                <xsd:element name="x" type="xsd:string"/>
            </xsd:schema>
        `;
        const errors: SchemaError[] = [];
        expect(() => compiler.compile(ROOT, { resolve: makeResolver({ "include.xsd": BAD }), listener: (e) => errors.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT")).toBe(true);
    });

    it("reports an error when no resolver is configured", () => {
        const errors: SchemaError[] = [];
        expect(() => compiler.compile(ROOT, { listener: (e) => errors.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(errors.some((e) => e.code === "SCHEMA_LOCATION_UNRESOLVED")).toBe(true);
    });

    it("reports an error on duplicate component definitions across included documents", () => {
        const DUP_ROOT = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root" type="xsd:string"/>
                <xsd:include schemaLocation="dup.xsd"/>
            </xsd:schema>
        `;
        const DUP = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root" type="xsd:integer"/>
            </xsd:schema>
        `;
        const errors: SchemaError[] = [];
        expect(() => compiler.compile(DUP_ROOT, { resolve: makeResolver({ "dup.xsd": DUP }), listener: (e) => errors.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT" && e.message.includes("Duplicate"))).toBe(true);
    });

    it("reports a circular include", () => {
        const A = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="a" type="xsd:string"/>
                <xsd:include schemaLocation="b.xsd"/>
            </xsd:schema>
        `;
        const B = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="b" type="xsd:string"/>
                <xsd:include schemaLocation="a.xsd"/>
            </xsd:schema>
        `;
        const errors: SchemaError[] = [];
        expect(() => compiler.compile(A, { resolve: makeResolver({ "a.xsd": A, "b.xsd": B }), listener: (e) => errors.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(errors.some((e) => e.code === "CIRCULAR_REFERENCE")).toBe(true);
    });

});

// ---------------------------------------------------------------------------
// xs:import — foreign grammar creation
// ---------------------------------------------------------------------------

describe("xs:import — foreign grammar (CHK-024)", () => {

    const MAIN = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}"
                    targetNamespace="urn:main"
                    xmlns:m="urn:main"
                    xmlns:ext="urn:ext">
            <xsd:import namespace="urn:ext" schemaLocation="ext.xsd"/>
            <xsd:element name="root" type="m:MainType"/>
            <xsd:complexType name="MainType">
                <xsd:sequence>
                    <xsd:element ref="ext:extElem"/>
                </xsd:sequence>
            </xsd:complexType>
        </xsd:schema>
    `;

    const EXT = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}"
                    targetNamespace="urn:ext"
                    xmlns:e="urn:ext">
            <xsd:element name="extElem" type="xsd:string"/>
        </xsd:schema>
    `;

    const resolve = makeResolver({ "ext.xsd": EXT });

    it("creates a foreign grammar for the imported namespace", () => {
        const schema = compiler.compile(MAIN, { resolve });
        expect(schema.grammars.has(namespaceKey("urn:ext"))).toBe(true);
        expect(schema.grammars.get(namespaceKey("urn:ext"))!.elements.has("extElem")).toBe(true);
    });

    it("resolves QName references across grammars", () => {
        const schema = compiler.compile(MAIN, { resolve });
        const grammar = schema.grammars.get(namespaceKey("urn:main"))!;
        const root = grammar.elements.get("root")!;
        const type = root.type;
        expect(type).toBeDefined();
        expect(type!.kind).toBe("complex-type");
    });

    it("validates a namespaced instance that uses an imported element", () => {
        const schema = compiler.compile(MAIN, { resolve });
        const xml = `
            <m:root xmlns:m="urn:main" xmlns:ext="urn:ext">
                <ext:extElem>hello</ext:extElem>
            </m:root>
        `;
        const result = validate(xml, schema);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it("reports an error when the imported document has a mismatched namespace", () => {
        const BAD_EXT = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:wrong">
                <xsd:element name="x" type="xsd:string"/>
            </xsd:schema>
        `;
        const errors: SchemaError[] = [];
        expect(() => compiler.compile(MAIN, { resolve: makeResolver({ "ext.xsd": BAD_EXT }), listener: (e) => errors.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT")).toBe(true);
    });

    it("reports an error when importing the schema's own target namespace", () => {
        const SELF_IMPORT = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:self">
                <xsd:import namespace="urn:self" schemaLocation="self.xsd"/>
                <xsd:element name="root" type="xsd:string"/>
            </xsd:schema>
        `;
        const errors: SchemaError[] = [];
        expect(() => compiler.compile(SELF_IMPORT, { resolve: makeResolver({ "self.xsd": "" }), listener: (e) => errors.push(e) }))
            .toThrow(SchemaCompilationError);
        // The error fires before the resolver is even called (own-namespace check)
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT" && e.message.includes("import"))).toBe(true);
    });

    it("import without schemaLocation is a no-op (no error, no grammar)", () => {
        const NO_LOC = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t">
                <xsd:import namespace="urn:ext"/>
                <xsd:element name="root" type="xsd:string"/>
            </xsd:schema>
        `;
        const schema = compiler.compile(NO_LOC, { resolve });
        expect(schema.grammars.has(namespaceKey("urn:ext"))).toBe(false);
        expect(schema.grammars.has(namespaceKey("urn:t"))).toBe(true);
    });

});

// ---------------------------------------------------------------------------
// xs:redefine — component augmentation
// ---------------------------------------------------------------------------

describe("xs:redefine — component augmentation (CHK-024)", () => {

    it("redefines a complex type with the augmentation pattern", () => {
        const BASE = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t"
                        xmlns:t="urn:t" xmlns="urn:t">
                <xsd:complexType name="Base">
                    <xsd:sequence>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:schema>
        `;
        const REDEF = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t"
                        xmlns:t="urn:t" xmlns="urn:t">
                <xsd:redefine schemaLocation="base.xsd">
                    <xsd:complexType name="Base">
                        <xsd:complexContent>
                            <xsd:extension base="Base">
                                <xsd:sequence>
                                    <xsd:element name="b" type="xsd:string"/>
                                </xsd:sequence>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:redefine>
                <xsd:element name="root" type="t:Base"/>
            </xsd:schema>
        `;
        const schema = compiler.compile(REDEF, { resolve: makeResolver({ "base.xsd": BASE }) });

        // The redefined type has both a and b elements
        const valid = validate(`<t:root xmlns:t="urn:t"><a>a</a><b>b</b></t:root>`, schema);
        expect(valid.valid).toBe(true);

        // Missing b is invalid
        const invalid = validate(`<t:root xmlns:t="urn:t"><a>a</a></t:root>`, schema);
        expect(invalid.valid).toBe(false);
    });

    it("reports an error when redefining a name that does not exist in the redefined document", () => {
        const BASE = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t"
                        xmlns:t="urn:t">
                <xsd:complexType name="Existing">
                    <xsd:sequence>
                        <xsd:element name="x" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:schema>
        `;
        const REDEF = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t"
                        xmlns:t="urn:t">
                <xsd:redefine schemaLocation="base.xsd">
                    <xsd:complexType name="Nonexistent">
                        <xsd:complexContent>
                            <xsd:extension base="Nonexistent"/>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:redefine>
                <xsd:element name="root" type="t:Existing"/>
            </xsd:schema>
        `;
        const errors: SchemaError[] = [];
        expect(() => compiler.compile(REDEF, { resolve: makeResolver({ "base.xsd": BASE }), listener: (e) => errors.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT" && e.message.includes("not defined"))).toBe(true);
    });

    it("reports an error when redefining an illegal component kind (element)", () => {
        const BASE = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t">
                <xsd:element name="E" type="xsd:string"/>
            </xsd:schema>
        `;
        const REDEF = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t"
                        xmlns:t="urn:t">
                <xsd:redefine schemaLocation="base.xsd">
                    <xsd:element name="E" type="xsd:integer"/>
                </xsd:redefine>
            </xsd:schema>
        `;
        const errors: SchemaError[] = [];
        expect(() => compiler.compile(REDEF, { resolve: makeResolver({ "base.xsd": BASE }), listener: (e) => errors.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT" && e.message.includes("cannot be redefined"))).toBe(true);
    });

    it("reports an error on duplicate redefinition of the same name", () => {
        const BASE = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t"
                        xmlns:t="urn:t">
                <xsd:complexType name="T">
                    <xsd:sequence>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:schema>
        `;
        const REDEF = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t"
                        xmlns:t="urn:t">
                <xsd:redefine schemaLocation="base.xsd">
                    <xsd:complexType name="T">
                        <xsd:complexContent>
                            <xsd:extension base="T"/>
                        </xsd:complexContent>
                    </xsd:complexType>
                    <xsd:complexType name="T">
                        <xsd:complexContent>
                            <xsd:extension base="T"/>
                        </xsd:complexContent>
                    </xsd:complexType>
                </xsd:redefine>
            </xsd:schema>
        `;
        const errors: SchemaError[] = [];
        expect(() => compiler.compile(REDEF, { resolve: makeResolver({ "base.xsd": BASE }), listener: (e) => errors.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT" && e.message.includes("redefined more than once"))).toBe(true);
    });

    it("redefines a simple type", () => {
        const BASE = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t"
                        xmlns:t="urn:t" xmlns="urn:t">
                <xsd:simpleType name="Code">
                    <xsd:restriction base="xsd:string">
                        <xsd:length value="3"/>
                    </xsd:restriction>
                </xsd:simpleType>
            </xsd:schema>
        `;
        const REDEF = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t"
                        xmlns:t="urn:t" xmlns="urn:t">
                <xsd:redefine schemaLocation="base.xsd">
                    <xsd:simpleType name="Code">
                        <xsd:restriction base="Code">
                            <xsd:pattern value="[A-Z]{3}"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:redefine>
                <xsd:element name="root" type="t:Code"/>
            </xsd:schema>
        `;
        const schema = compiler.compile(REDEF, { resolve: makeResolver({ "base.xsd": BASE }) });
        expect(validate(`<t:root xmlns:t="urn:t">ABC</t:root>`, schema).valid).toBe(true);
        expect(validate(`<t:root xmlns:t="urn:t">abc</t:root>`, schema).valid).toBe(false);
        expect(validate(`<t:root xmlns:t="urn:t">AB</t:root>`, schema).valid).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// xsi:schemaLocation / xsi:noNamespaceSchemaLocation at validation time
// ---------------------------------------------------------------------------

describe("xsi:schemaLocation at validation time (CHK-024)", () => {

    const XSD = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:ns"
                    xmlns:t="urn:ns">
            <xsd:element name="e" type="xsd:string"/>
        </xsd:schema>
    `;

    it("honors a valid xsi:schemaLocation hint (grammar exists)", () => {
        const schema = compiler.compile(XSD);
        const result = validate(`<t:e xmlns:t="urn:ns" xsi:schemaLocation="urn:ns a.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">hello</t:e>`, schema);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it("reports an error when xsi:schemaLocation declares a namespace with no grammar", () => {
        const schema = compiler.compile(XSD);
        const result = validate(`<t:e xmlns:t="urn:ns" xsi:schemaLocation="urn:missing missing.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">hello</t:e>`, schema);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.code === "SCHEMA_LOCATION_UNRESOLVED")).toBe(true);
    });

    it("reports an error when xsi:noNamespaceSchemaLocation has no matching grammar", () => {
        const schema = compiler.compile(XSD);
        const result = validate(`<t:e xmlns:t="urn:ns" xsi:noNamespaceSchemaLocation="missing.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">hello</t:e>`, schema);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.code === "SCHEMA_LOCATION_UNRESOLVED" && e.message.includes("noNamespace"))).toBe(true);
    });

    it("honors xsi:noNamespaceSchemaLocation when the grammar exists", () => {
        const NO_NS_XSD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="e" type="xsd:string"/>
            </xsd:schema>
        `;
        const schema = compiler.compile(NO_NS_XSD);
        const result = validate(`<e xsi:noNamespaceSchemaLocation="schema.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">hello</e>`, schema);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

});

// ---------------------------------------------------------------------------
// Combined multi-document end-to-end
// ---------------------------------------------------------------------------

describe("combined multi-document end-to-end (CHK-024)", () => {

    // A schema set with include + import + redefine:
    //
    //   main.xsd (targetNamespace="urn:main")
    //     includes shared.xsd  (same namespace) — adds a common type
    //     imports ext.xsd      (urn:ext) — adds an element
    //     redefines base.xsd   (urn:main) — augments type Base → Base + author
    //
    // Instance validates show the full pipeline works.

    const SHARED = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:main"
                    xmlns:t="urn:main">
            <xsd:complexType name="Person">
                <xsd:sequence>
                    <xsd:element name="name" type="xsd:string"/>
                </xsd:sequence>
            </xsd:complexType>
        </xsd:schema>
    `;

    const BASE = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:main"
                    xmlns:t="urn:main">
            <xsd:complexType name="Base">
                <xsd:sequence>
                    <xsd:element name="title" type="xsd:string"/>
                </xsd:sequence>
                <xsd:attribute name="id" type="xsd:string"/>
            </xsd:complexType>
        </xsd:schema>
    `;

    const EXT = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:ext"
                    xmlns:e="urn:ext">
            <xsd:element name="extra" type="xsd:string"/>
        </xsd:schema>
    `;

    const MAIN = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:main"
                    xmlns:t="urn:main" xmlns:ext="urn:ext" xmlns="urn:main">
            <xsd:include schemaLocation="shared.xsd"/>
            <xsd:import namespace="urn:ext" schemaLocation="ext.xsd"/>
            <xsd:redefine schemaLocation="base.xsd">
                <xsd:complexType name="Base">
                    <xsd:complexContent>
                        <xsd:extension base="Base">
                            <xsd:sequence>
                                <xsd:element name="author" type="t:Person"/>
                                <xsd:any namespace="##other" processContents="lax" minOccurs="0"/>
                            </xsd:sequence>
                        </xsd:extension>
                    </xsd:complexContent>
                </xsd:complexType>
            </xsd:redefine>
            <xsd:element name="book" type="t:Base"/>
        </xsd:schema>
    `;

    const resolve = makeResolver({
        "shared.xsd": SHARED,
        "base.xsd": BASE,
        "ext.xsd": EXT,
    });

    it("compiles a multi-document schema set with include + import + redefine", () => {
        const schema = compiler.compile(MAIN, { resolve });
        const mainNs = namespaceKey("urn:main");
        const extNs = namespaceKey("urn:ext");

        // The main grammar has components from MAIN, SHARED, and the redefined BASE
        expect(schema.grammars.has(mainNs)).toBe(true);
        const mainGrammar = schema.grammars.get(mainNs)!;
        expect(mainGrammar.elements.has("book")).toBe(true);
        expect(mainGrammar.types.has("Person")).toBe(true);
        expect(mainGrammar.types.has("Base")).toBe(true);

        // The imported grammar has the ext element
        expect(schema.grammars.has(extNs)).toBe(true);
        expect(schema.grammars.get(extNs)!.elements.has("extra")).toBe(true);
    });

    it("validates a conforming instance against the combined schema", () => {
        const schema = compiler.compile(MAIN, { resolve });
        const xml = `
            <t:book xmlns:t="urn:main" xmlns:ext="urn:ext" id="b1">
                <title>The Book</title>
                <author>
                    <name>Writer</name>
                </author>
                <ext:extra>notes</ext:extra>
            </t:book>
        `;
        const result = validate(xml, schema);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it("rejects an instance missing the redefined type's new element", () => {
        const schema = compiler.compile(MAIN, { resolve });
        const xml = `
            <t:book xmlns:t="urn:main" id="b1">
                <title>The Book</title>
            </t:book>
        `;
        const result = validate(xml, schema);
        expect(result.valid).toBe(false);
        // The redefined Base requires author (from the extension), and the
        // original Base requires title — both are here but author is missing.
        expect(result.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT" && e.message.includes("author"))).toBe(true);
    });

});

// ---------------------------------------------------------------------------
// namespaceKey helper (used in import tests)
// ---------------------------------------------------------------------------

function namespaceKey(ns: string | null): string {
    return ns ?? "";
}