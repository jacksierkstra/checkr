/**
 * Notations and annotations tests (CHK-026).
 *
 * Tests notation declaration compilation, NOTATION-typed value space (values
 * must reference a declared notation), and annotation parsing (parse and
 * attach without affecting validity).
 */

import { SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { InstanceValidatorImpl } from "@lib/validator/compiled/instanceValidator";
import { XMLParserImpl } from "@lib/xml/parser";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
import { SchemaCompilationError, SchemaError } from "@lib/types/schema-error";
import { NotationDeclaration } from "@lib/types/component-graph";

const compiler = new SchemaCompilerImpl(new XMLParserImpl());
const validator = new InstanceValidatorImpl(new XMLParserImpl());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compileExpectingErrors(xsd: string): SchemaError[] {
    const errors: SchemaError[] = [];
    expect(() => compiler.compile(xsd, { listener: (e) => errors.push(e) }))
        .toThrow(SchemaCompilationError);
    return errors;
}

function compileExpectingClean(xsd: string): ReturnType<typeof compiler.compile> {
    const errors: SchemaError[] = [];
    const result = compiler.compile(xsd, { listener: (e) => errors.push(e) });
    expect(errors).toHaveLength(0);
    return result;
}

function notationFromSchema(schema: ReturnType<typeof compiler.compile>, ns: string | null, localName: string): NotationDeclaration | undefined {
    return schema.grammars.get(ns ?? "")?.notations.get(localName);
}

// ---------------------------------------------------------------------------
// Notation declaration compilation
// ---------------------------------------------------------------------------

describe("Notation declarations (CHK-026)", () => {

    it("compiles a notation with public and system identifiers", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:notation name="jpeg" public="image/jpeg" system="viewer.exe"/>
            </xsd:schema>
        `);
        const n = notationFromSchema(schema, null, "jpeg");
        expect(n).toBeDefined();
        expect(n!.kind).toBe("notation");
        expect(n!.name).toEqual({ namespaceURI: null, localName: "jpeg" });
        expect(n!.public).toBe("image/jpeg");
        expect(n!.system).toBe("viewer.exe");
    });

    it("compiles a notation with only a public identifier", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:notation name="gif" public="image/gif"/>
            </xsd:schema>
        `);
        const n = notationFromSchema(schema, null, "gif");
        expect(n).toBeDefined();
        expect(n!.public).toBe("image/gif");
        expect(n!.system).toBeNull();
    });

    it("compiles a notation with only a system identifier", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:notation name="pdf" system="reader.pdf"/>
            </xsd:schema>
        `);
        const n = notationFromSchema(schema, null, "pdf");
        expect(n).toBeDefined();
        expect(n!.public).toBeNull();
        expect(n!.system).toBe("reader.pdf");
    });

    it("registers a notation in the target namespace grammar", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns">
                <xsd:notation name="png" public="image/png" system="png.exe"/>
            </xsd:schema>
        `);
        const n = notationFromSchema(schema, "http://example.com/ns", "png");
        expect(n).toBeDefined();
        expect(n!.name.namespaceURI).toBe("http://example.com/ns");
    });

    it("reports a fatal error when notation has no name", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:notation public="image/jpeg"/>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT" && e.severity === "fatal")).toBe(true);
    });

    it("reports an error when notation has neither public nor system", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:notation name="empty"/>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT")).toBe(true);
    });

    it("reports a duplicate notation error", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns">
                <xsd:notation name="dup" public="a"/>
                <xsd:notation name="dup" public="b"/>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT" && e.message.includes("Duplicate"))).toBe(true);
    });

    it("tolerates a notation alongside other global components", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns">
                <xsd:notation name="foo" public="urn:foo"/>
                <xsd:element name="el" type="xsd:string"/>
                <xsd:attribute name="at" type="xsd:string"/>
                <xsd:complexType name="ct"/>
                <xsd:simpleType name="st">
                    <xsd:restriction base="xsd:string"/>
                </xsd:simpleType>
            </xsd:schema>
        `);
        expect(notationFromSchema(schema, "http://example.com/ns", "foo")).toBeDefined();
        expect(schema.grammars.get("http://example.com/ns")?.elements.get("el")).toBeDefined();
        expect(schema.grammars.get("http://example.com/ns")?.attributes.get("at")).toBeDefined();
        expect(schema.grammars.get("http://example.com/ns")?.types.get("ct")).toBeDefined();
        expect(schema.grammars.get("http://example.com/ns")?.types.get("st")).toBeDefined();
    });

});

// ---------------------------------------------------------------------------
// NOTATION value-space validation
// ---------------------------------------------------------------------------

describe("NOTATION value-space validation (CHK-026)", () => {

    it("validates a NOTATION-typed attribute value against declared notations", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns"
                xmlns:ex="http://example.com/ns">
                <xsd:notation name="jpeg" public="image/jpeg" system="viewer.exe"/>
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:attribute name="fmt" type="ex:notationType"/>
                    </xsd:complexType>
                </xsd:element>
                <xsd:simpleType name="notationType">
                    <xsd:restriction base="xsd:NOTATION">
                        <xsd:enumeration value="ex:jpeg"/>
                    </xsd:restriction>
                </xsd:simpleType>
            </xsd:schema>
        `);
        const result = validator.validate(`<root xmlns="http://example.com/ns" xmlns:ex="http://example.com/ns" fmt="ex:jpeg"/>`, schema);
        expect(result.valid).toBe(true);
    });

    it("reports UNDECLARED_NOTATION for a NOTATION-typed value naming an undeclared notation", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns"
                xmlns:ex="http://example.com/ns">
                <xsd:notation name="jpeg" public="image/jpeg" system="viewer.exe"/>
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:attribute name="fmt" type="ex:notationType"/>
                    </xsd:complexType>
                </xsd:element>
                <xsd:simpleType name="notationType">
                    <xsd:restriction base="xsd:NOTATION">
                        <xsd:enumeration value="ex:gif"/>
                    </xsd:restriction>
                </xsd:simpleType>
            </xsd:schema>
        `);
        const errors: SchemaError[] = [];
        const result = validator.validate(`<root xmlns="http://example.com/ns" xmlns:ex="http://example.com/ns" fmt="ex:gif"/>`, schema, { listener: (e) => errors.push(e) });
        expect(result.valid).toBe(false);
        expect(errors.some((e) => e.code === "UNDECLARED_NOTATION")).toBe(true);
    });

    it("validates a NOTATION-typed element text against declared notations", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns"
                xmlns:ex="http://example.com/ns">
                <xsd:notation name="pdf" public="application/pdf" system="reader.exe"/>
                <xsd:element name="root" type="ex:notationType"/>
                <xsd:simpleType name="notationType">
                    <xsd:restriction base="xsd:NOTATION">
                        <xsd:enumeration value="ex:pdf"/>
                    </xsd:restriction>
                </xsd:simpleType>
            </xsd:schema>
        `);
        const result = validator.validate(`<root xmlns="http://example.com/ns" xmlns:ex="http://example.com/ns">ex:pdf</root>`, schema);
        expect(result.valid).toBe(true);
    });

    it("reports UNDECLARED_NOTATION for element text of undeclared notation", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns"
                xmlns:ex="http://example.com/ns">
                <xsd:notation name="pdf" public="application/pdf" system="reader.exe"/>
                <xsd:element name="root" type="ex:notationType"/>
                <xsd:simpleType name="notationType">
                    <xsd:restriction base="xsd:NOTATION">
                        <xsd:enumeration value="ex:pdf"/>
                    </xsd:restriction>
                </xsd:simpleType>
            </xsd:schema>
        `);
        const errors: SchemaError[] = [];
        const result = validator.validate(`<root xmlns="http://example.com/ns" xmlns:ex="http://example.com/ns">ex:unknown</root>`, schema, { listener: (e) => errors.push(e) });
        expect(result.valid).toBe(false);
        expect(errors.some((e) => e.code === "UNDECLARED_NOTATION")).toBe(true);
    });

    it("resolves an unprefixed NOTATION value against the default namespace", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns"
                xmlns:ns="http://example.com/ns">
                <xsd:notation name="jpeg" public="image/jpeg" system="viewer.exe"/>
                <xsd:element name="root" type="ns:notationType"/>
                <xsd:simpleType name="notationType">
                    <xsd:restriction base="xsd:NOTATION">
                        <xsd:enumeration value="jpeg"/>
                    </xsd:restriction>
                </xsd:simpleType>
            </xsd:schema>
        `);
        // Unprefixed value resolves against the default namespace xmlns="http://example.com/ns",
        // which is the target namespace of the notation.
        const result = validator.validate(`<root xmlns="http://example.com/ns">jpeg</root>`, schema);
        expect(result.valid).toBe(true);
    });

    it("reports UNDECLARED_NOTATION when an unprefixed NOTATION value has no default namespace", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns"
                xmlns:ns="http://example.com/ns">
                <xsd:notation name="jpeg" public="image/jpeg" system="viewer.exe"/>
                <xsd:element name="root" type="ns:notationType"/>
                <xsd:simpleType name="notationType">
                    <xsd:restriction base="xsd:NOTATION">
                        <xsd:enumeration value="jpeg"/>
                    </xsd:restriction>
                </xsd:simpleType>
            </xsd:schema>
        `);
        // Instance uses a prefixed root element so the element is found, but
        // the unprefixed value "jpeg" has no default namespace → resolves to
        // {null}jpeg → not a declared notation in the schema.
        const errors: SchemaError[] = [];
        const result = validator.validate(`<ns:root xmlns:ns="http://example.com/ns">jpeg</ns:root>`, schema, { listener: (e) => errors.push(e) });
        expect(result.valid).toBe(false);
        expect(errors.some((e) => e.code === "UNDECLARED_NOTATION")).toBe(true);
    });

    it("a NOTATION-derived type in a namespace resolves correctly", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns"
                xmlns:ex="http://example.com/ns">
                <xsd:notation name="jpeg" public="image/jpeg"/>
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:attribute name="format" type="ex:notationType"/>
                    </xsd:complexType>
                </xsd:element>
                <xsd:simpleType name="notationType">
                    <xsd:restriction base="xsd:NOTATION">
                        <xsd:enumeration value="ex:jpeg"/>
                    </xsd:restriction>
                </xsd:simpleType>
            </xsd:schema>
        `);
        const result = validator.validate(`<root xmlns="http://example.com/ns" xmlns:ex="http://example.com/ns" format="ex:jpeg"/>`, schema);
        expect(result.valid).toBe(true);
    });

});

// ---------------------------------------------------------------------------
// Annotation parsing
// ---------------------------------------------------------------------------

describe("Annotation parsing (CHK-026)", () => {

    it("parses schema-level annotations on the root element", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:annotation>
                    <xsd:documentation source="doc-source">Schema doc</xsd:documentation>
                    <xsd:appinfo source="app-source">some app info</xsd:appinfo>
                </xsd:annotation>
                <xsd:element name="root" type="xsd:string"/>
            </xsd:schema>
        `);
        expect(schema.annotations).toHaveLength(1);
        const ann = schema.annotations[0]!;
        expect(ann.kind).toBe("annotation");
        expect(ann.items).toHaveLength(2);
        expect(ann.items[0]!.kind).toBe("documentation");
        expect(ann.items[0]!.source).toBe("doc-source");
        expect(ann.items[0]!.content).toContain("Schema doc");
        expect(ann.items[1]!.kind).toBe("appinfo");
        expect(ann.items[1]!.source).toBe("app-source");
        expect(ann.items[1]!.content).toContain("some app info");
    });

    it("attaches annotations to element declarations", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:annotation>
                        <xsd:documentation>Element annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:complexType>
                        <xsd:sequence/>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        const el = schema.grammars.get("")!.elements.get("root")!;
        expect(el.annotations).toHaveLength(1);
        expect(el.annotations[0]!.items[0]!.content).toContain("Element annotation");
    });

    it("attaches annotations to global simple type definitions", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:simpleType name="myType">
                    <xsd:annotation>
                        <xsd:documentation>Simple type annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:restriction base="xsd:string"/>
                </xsd:simpleType>
            </xsd:schema>
        `);
        const st = schema.grammars.get("")!.types.get("myType")!;
        expect(st.annotations).toHaveLength(1);
        expect(st.annotations[0]!.items[0]!.content).toContain("Simple type annotation");
    });

    it("attaches annotations to complex type definitions", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="myType">
                    <xsd:annotation>
                        <xsd:documentation>Complex type annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:sequence/>
                </xsd:complexType>
            </xsd:schema>
        `);
        const ct = schema.grammars.get("")!.types.get("myType")!;
        expect(ct.annotations).toHaveLength(1);
        expect(ct.annotations[0]!.items[0]!.content).toContain("Complex type annotation");
    });

    it("attaches annotations to global attribute declarations", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:attribute name="myAttr">
                    <xsd:annotation>
                        <xsd:documentation>Attribute annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:simpleType>
                        <xsd:restriction base="xsd:string"/>
                    </xsd:simpleType>
                </xsd:attribute>
            </xsd:schema>
        `);
        const attr = schema.grammars.get("")!.attributes.get("myAttr")!;
        expect(attr.annotations).toHaveLength(1);
        expect(attr.annotations[0]!.items[0]!.content).toContain("Attribute annotation");
    });

    it("attaches annotations to model group definitions", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:group name="myGroup">
                    <xsd:annotation>
                        <xsd:documentation>Group annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:sequence>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:group>
            </xsd:schema>
        `);
        const group = schema.grammars.get("")!.modelGroups.get("myGroup")!;
        expect(group.annotations).toHaveLength(1);
        expect(group.annotations[0]!.items[0]!.content).toContain("Group annotation");
    });

    it("attaches annotations to attribute group definitions", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:attributeGroup name="myAG">
                    <xsd:annotation>
                        <xsd:documentation>Attr group annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:attribute name="a" type="xsd:string"/>
                </xsd:attributeGroup>
            </xsd:schema>
        `);
        const ag = schema.grammars.get("")!.attributeGroups.get("myAG")!;
        expect(ag.annotations).toHaveLength(1);
        expect(ag.annotations[0]!.items[0]!.content).toContain("Attr group annotation");
    });

    it("attaches annotations to notation declarations", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:notation name="jpeg" public="image/jpeg">
                    <xsd:annotation>
                        <xsd:documentation>Notation annotation</xsd:documentation>
                    </xsd:annotation>
                </xsd:notation>
            </xsd:schema>
        `);
        const n = notationFromSchema(schema, null, "jpeg")!;
        expect(n.annotations).toHaveLength(1);
        expect(n.annotations[0]!.items[0]!.content).toContain("Notation annotation");
    });

    it("tolerates multiple annotations on one component", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:annotation>
                        <xsd:documentation>First annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:annotation>
                        <xsd:documentation>Second annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:complexType>
                        <xsd:sequence/>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        const el = schema.grammars.get("")!.elements.get("root")!;
        expect(el.annotations).toHaveLength(2);
    });

    it("annotations have no effect on validity — element schema with annotations compiles and validates", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:annotation>
                    <xsd:documentation>Schema doc</xsd:documentation>
                </xsd:annotation>
                <xsd:element name="root" type="xsd:string">
                    <xsd:annotation>
                        <xsd:documentation>Element doc</xsd:documentation>
                    </xsd:annotation>
                </xsd:element>
            </xsd:schema>
        `);
        const result = validator.validate("<root>hello</root>", schema);
        expect(result.valid).toBe(true);
    });

    it("annotations in local positions (particles, attribute uses) are tolerated", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="ct" type="ctType"/>
                <xsd:complexType name="ctType">
                    <xsd:sequence>
                        <xsd:annotation>
                            <xsd:documentation>Inside sequence</xsd:documentation>
                        </xsd:annotation>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                    <xsd:attribute name="x" type="xsd:string">
                        <xsd:annotation>
                            <xsd:documentation>Inside attribute use</xsd:documentation>
                        </xsd:annotation>
                    </xsd:attribute>
                </xsd:complexType>
            </xsd:schema>
        `);
        // The annotations are tolerated (not parsed/attached in local positions,
        // but compilation and validation work fine).
        const result = validator.validate(`<ct x="y"><a>v</a></ct>`, schema);
        expect(result.valid).toBe(true);
    });

});

// ---------------------------------------------------------------------------
// XSTS-style schemaTest pair (annotations-only tests pass vacuously)
// ---------------------------------------------------------------------------

describe("XSTS annotations-only tests (CHK-026)", () => {

    it("a schema with annotations on every global component compiles and validates", () => {
        const schema = compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="http://example.com/ns"
                xmlns:ex="http://example.com/ns">
                <xsd:annotation>
                    <xsd:documentation>Schema-level annotation</xsd:documentation>
                </xsd:annotation>
                <xsd:element name="root" type="ex:myType">
                    <xsd:annotation>
                        <xsd:documentation>Element annotation</xsd:documentation>
                    </xsd:annotation>
                </xsd:element>
                <xsd:attribute name="myAttr" type="xsd:string">
                    <xsd:annotation>
                        <xsd:documentation>Attribute annotation</xsd:documentation>
                    </xsd:annotation>
                </xsd:attribute>
                <xsd:complexType name="myType">
                    <xsd:annotation>
                        <xsd:documentation>Complex type annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:sequence/>
                </xsd:complexType>
                <xsd:simpleType name="myST">
                    <xsd:annotation>
                        <xsd:documentation>Simple type annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:restriction base="xsd:string"/>
                </xsd:simpleType>
                <xsd:group name="myGroup">
                    <xsd:annotation>
                        <xsd:documentation>Group annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:sequence>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:group>
                <xsd:attributeGroup name="myAG">
                    <xsd:annotation>
                        <xsd:documentation>AttrGroup annotation</xsd:documentation>
                    </xsd:annotation>
                    <xsd:attribute name="x" type="xsd:string"/>
                </xsd:attributeGroup>
                <xsd:notation name="myNotation" public="urn:test">
                    <xsd:annotation>
                        <xsd:documentation>Notation annotation</xsd:documentation>
                    </xsd:annotation>
                </xsd:notation>
            </xsd:schema>
        `);
        const result = validator.validate(`<root xmlns="http://example.com/ns"/>`, schema);
        expect(result.valid).toBe(true);
    });

});