import { XMLParserImpl } from "@lib/xml/parser";
import { SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { InstanceValidatorImpl } from "@lib/validator/compiled/instanceValidator";
import { CompiledSchema } from "@lib/types/component-graph";
import { NAMESPACE_XSD, NAMESPACE_XSI } from "@lib/types/namespaces";
import { SchemaError, SchemaValidationResult } from "@lib/types/schema-error";

const compiler = new SchemaCompilerImpl(new XMLParserImpl());
const validator = new InstanceValidatorImpl(new XMLParserImpl());

function compile(xsd: string): CompiledSchema {
    return compiler.compile(xsd);
}

function check(xml: string, schema: CompiledSchema, options?: { listener?: (e: SchemaError) => void }): SchemaValidationResult {
    return validator.validate(xml, schema, options);
}

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

describe("InstanceValidator — two-phase core (CHK-008)", () => {

    describe("minimal round trip", () => {

        it("accepts a conforming instance with no errors", () => {
            const schema = compile(MINIMAL_XSD);
            const { valid, errors } = check(`<root><foo>a</foo><bar>b</bar></root>`, schema);
            expect(valid).toBe(true);
            expect(errors).toHaveLength(0);
        });

        it("rejects a non-conforming instance (missing required element)", () => {
            const schema = compile(MINIMAL_XSD);
            const { valid, errors } = check(`<root><foo>a</foo></root>`, schema);
            expect(valid).toBe(false);
            expect(errors).toHaveLength(1);
            expect(errors[0]!.code).toBe("MISSING_REQUIRED_ELEMENT");
            expect(errors[0]!.message).toContain("bar");
        });

        it("rejects an extra undeclared child element", () => {
            const schema = compile(MINIMAL_XSD);
            const { valid, errors } = check(`<root><foo>a</foo><bar>b</bar><extra/></root>`, schema);
            expect(valid).toBe(false);
            const unexpected = errors.filter((e) => e.code === "UNEXPECTED_ELEMENT");
            expect(unexpected).toHaveLength(1);
            expect(unexpected[0]!.message).toContain("extra");
        });

        it("rejects an out-of-order instance (greedy matching: missing + unexpected)", () => {
            const schema = compile(MINIMAL_XSD);
            const { valid, errors } = check(`<root><bar>b</bar><foo>a</foo></root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT")).toBe(true);
            expect(errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
        });

        it("rejects an undeclared root element", () => {
            const schema = compile(MINIMAL_XSD);
            const { valid, errors } = check(`<notRoot/>`, schema);
            expect(valid).toBe(false);
            expect(errors).toHaveLength(1);
            expect(errors[0]!.code).toBe("UNDECLARED_ELEMENT");
        });

        it("rejects non-well-formed XML with a fatal error", () => {
            const schema = compile(MINIMAL_XSD);
            const { valid, errors } = check(`<root><unclosed></root>`, schema);
            expect(valid).toBe(false);
            expect(errors[0]!.code).toBe("INVALID_INSTANCE_DOCUMENT");
            expect(errors[0]!.severity).toBe("fatal");
        });

    });

    describe("content models", () => {

        it("enforces minOccurs=0 and maxOccurs counts", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string" minOccurs="0"/>
                                <xsd:element name="b" type="xsd:string" minOccurs="0" maxOccurs="2"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><b>x</b></root>`, schema).valid).toBe(true);
            expect(check(`<root><b>x</b><b>y</b></root>`, schema).valid).toBe(true);
            expect(check(`<root><b>x</b><b>y</b><b>z</b></root>`, schema).valid).toBe(false);
            expect(check(`<root></root>`, schema).valid).toBe(true);
        });

        it("enforces maxOccurs=unbounded", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="item" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const items = Array.from({ length: 50 }, () => "<item>x</item>").join("");
            expect(check(`<root>${items}</root>`, schema).valid).toBe(true);
        });

        it("rejects character data in an element-only type", () => {
            const schema = compile(MINIMAL_XSD);
            const { valid, errors } = check(`<root>text<foo>a</foo><bar>b</bar></root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "UNEXPECTED_TEXT_CONTENT")).toBe(true);
        });

        it("accepts whitespace in an element-only type", () => {
            const schema = compile(MINIMAL_XSD);
            const { valid, errors } = check(`<root>\n  <foo>a</foo>\n  <bar>b</bar>\n</root>`, schema);
            expect(valid).toBe(true);
            expect(errors).toHaveLength(0);
        });

        it("rejects child elements under a simple type", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root" type="xsd:string"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root>plain text</root>`, schema).valid).toBe(true);
            const { valid, errors } = check(`<root><nested/></root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "INVALID_ELEMENT_CONTENT")).toBe(true);
        });

        it("validates choice: exactly one alternative matches, others are rejected", () => {
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
            const schema = compile(xsd);
            // Valid: one matching alternative
            expect(check(`<root><a>x</a></root>`, schema).valid).toBe(true);
            expect(check(`<root><b>y</b></root>`, schema).valid).toBe(true);
            // Invalid: multiple children in a choice with maxOccurs=1
            const r1 = check(`<root><a>x</a><b>y</b></root>`, schema);
            expect(r1.valid).toBe(false);
            expect(r1.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
            // Invalid: no matching alternative
            const r2 = check(`<root><c>z</c></root>`, schema);
            expect(r2.valid).toBe(false);
            expect(r2.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
        });

        describe("choice semantics (CHK-018)", () => {

            it("accepts a choice with minOccurs=0 when no children match", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:choice minOccurs="0">
                                    <xsd:element name="a" type="xsd:string"/>
                                    <xsd:element name="b" type="xsd:string"/>
                                </xsd:choice>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<root></root>`, schema).valid).toBe(true);
            });

            it("rejects a choice element that does not match any alternative", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:choice>
                                    <xsd:element name="a" type="xsd:string"/>
                                </xsd:choice>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                const r = check(`<root><b>y</b></root>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
            });

        });

        describe("all-group (CHK-018)", () => {

            it("accepts an all-group with all children in any order", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:complexType name="Order">
                            <xsd:all>
                                <xsd:element name="name" type="xsd:string"/>
                                <xsd:element name="price" type="xsd:decimal"/>
                                <xsd:element name="qty" type="xsd:integer"/>
                            </xsd:all>
                        </xsd:complexType>
                        <xsd:element name="order" type="Order"/>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                // In order
                expect(check(`<order><name>foo</name><price>10.0</price><qty>5</qty></order>`, schema).valid).toBe(true);
                // Out of order
                expect(check(`<order><price>10.0</price><qty>5</qty><name>foo</name></order>`, schema).valid).toBe(true);
                // Another order
                expect(check(`<order><qty>5</qty><name>foo</name><price>10.0</price></order>`, schema).valid).toBe(true);
            });

            it("rejects duplicate children in an all-group", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:complexType name="Order">
                            <xsd:all>
                                <xsd:element name="name" type="xsd:string"/>
                                <xsd:element name="price" type="xsd:decimal"/>
                            </xsd:all>
                        </xsd:complexType>
                        <xsd:element name="order" type="Order"/>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                const r = check(`<order><name>foo</name><price>10.0</price><name>bar</name></order>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
            });

            it("rejects an undeclared child in an all-group", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:complexType name="Order">
                            <xsd:all>
                                <xsd:element name="name" type="xsd:string"/>
                            </xsd:all>
                        </xsd:complexType>
                        <xsd:element name="order" type="Order"/>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                const r = check(`<order><name>foo</name><extra>bad</extra></order>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "UNEXPECTED_ELEMENT" && e.message.includes("extra"))).toBe(true);
            });

            it("accepts an all-group with minOccurs=0 when empty", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:complexType name="Order">
                            <xsd:all minOccurs="0">
                                <xsd:element name="name" type="xsd:string"/>
                            </xsd:all>
                        </xsd:complexType>
                        <xsd:element name="order" type="Order"/>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<order></order>`, schema).valid).toBe(true);
            });

            it("accepts an all-group with optional children", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:complexType name="Order">
                            <xsd:all>
                                <xsd:element name="name" type="xsd:string"/>
                                <xsd:element name="note" type="xsd:string" minOccurs="0"/>
                            </xsd:all>
                        </xsd:complexType>
                        <xsd:element name="order" type="Order"/>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<order><name>foo</name></order>`, schema).valid).toBe(true);
                expect(check(`<order><note>hello</note><name>foo</name></order>`, schema).valid).toBe(true);
            });

        });

        describe("nested compositors (CHK-018)", () => {

            it("validates a sequence containing a choice", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:sequence>
                                    <xsd:element name="a" type="xsd:string"/>
                                    <xsd:choice>
                                        <xsd:element name="b" type="xsd:string"/>
                                        <xsd:element name="c" type="xsd:string"/>
                                    </xsd:choice>
                                </xsd:sequence>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<root><a>1</a><b>2</b></root>`, schema).valid).toBe(true);
                expect(check(`<root><a>1</a><c>3</c></root>`, schema).valid).toBe(true);
                // a followed by something not b or c: not matching choice
                const r = check(`<root><a>1</a><d>4</d></root>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
            });

            it("validates a choice containing a sequence", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:choice>
                                    <xsd:sequence>
                                        <xsd:element name="a" type="xsd:string"/>
                                        <xsd:element name="b" type="xsd:string"/>
                                    </xsd:sequence>
                                    <xsd:element name="c" type="xsd:string"/>
                                </xsd:choice>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<root><a>1</a><b>2</b></root>`, schema).valid).toBe(true);
                expect(check(`<root><c>3</c></root>`, schema).valid).toBe(true);
                // a without b: the choice matches a (sequence starts with a) but not enough for min b
                const r = check(`<root><a>1</a></root>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT")).toBe(true);
            });

            it("validates a sequence containing a sequence (nested)", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:sequence>
                                    <xsd:sequence>
                                        <xsd:element name="a" type="xsd:string"/>
                                        <xsd:element name="b" type="xsd:string"/>
                                    </xsd:sequence>
                                    <xsd:element name="c" type="xsd:string"/>
                                </xsd:sequence>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<root><a>1</a><b>2</b><c>3</c></root>`, schema).valid).toBe(true);
            });

            it("validates a choice with maxOccurs=unbounded (repeating choice)", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:choice maxOccurs="unbounded">
                                    <xsd:element name="a" type="xsd:string"/>
                                    <xsd:element name="b" type="xsd:string"/>
                                </xsd:choice>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<root><a>1</a><b>2</b><a>3</a></root>`, schema).valid).toBe(true);
                expect(check(`<root><b>1</b><b>2</b><b>3</b></root>`, schema).valid).toBe(true);
                expect(check(`<root><a>1</a><a>2</a></root>`, schema).valid).toBe(true);
                expect(check(`<root></root>`, schema).valid).toBe(true);
            });

        });

    });

    describe("attributes", () => {

        const ATTR_XSD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:attribute name="id" type="xsd:string"/>
                        <xsd:attribute name="code" type="xsd:string" use="required"/>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;

        it("accepts declared attributes and rejects undeclared ones", () => {
            const schema = compile(ATTR_XSD);
            expect(check(`<root id="a" code="b"/>`, schema).valid).toBe(true);
            const { valid, errors } = check(`<root id="a" code="b" extra="x"/>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "UNDECLARED_ATTRIBUTE" && e.message.includes("extra"))).toBe(true);
        });

        it("reports a missing required attribute", () => {
            const schema = compile(ATTR_XSD);
            const { valid, errors } = check(`<root id="a"/>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "MISSING_REQUIRED_ATTRIBUTE" && e.message.includes("code"))).toBe(true);
        });

        it("ignores xmlns, xml: and xsi: attributes", () => {
            const schema = compile(ATTR_XSD);
            const xml = `<root id="a" code="b" xmlns:q="urn:q" xml:lang="en" xmlns:xsi="${NAMESPACE_XSD.replace("Schema", "Schema-instance")}" xsi:nil="false"/>`;
            expect(check(xml, schema).valid).toBe(true);
        });

    });

    describe("namespaces", () => {

        const NS_XSD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:book" elementFormDefault="qualified">
                <xsd:element name="book">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="title" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;

        it("validates a namespaced instance (qualified local elements)", () => {
            const schema = compile(NS_XSD);
            const xml = `<t:book xmlns:t="urn:book" xmlns="urn:book"><title>Deep Work</title></t:book>`;
            expect(check(xml, schema).valid).toBe(true);
        });

        it("rejects a qualified local element that appears unqualified", () => {
            const schema = compile(NS_XSD);
            const xml = `<t:book xmlns:t="urn:book"><title xmlns="">Deep Work</title></t:book>`;
            const { valid } = check(xml, schema);
            expect(valid).toBe(false);
        });

        it("validates an unqualified local element inside a target-namespace schema", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:book">
                    <xsd:element name="book">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="title" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const xml = `<t:book xmlns:t="urn:book"><title>Deep Work</title></t:book>`;
            expect(check(xml, schema).valid).toBe(true);
        });

    });

    describe("error shape and listener", () => {

        it("carries the full SchemaError shape on every error", () => {
            const schema = compile(MINIMAL_XSD);
            const { valid, errors } = check(`<root><foo>a</foo></root>`, schema);
            expect(valid).toBe(false);
            const error = errors[0]!;
            expect(error.severity).toBe("error");
            expect(typeof error.code).toBe("string");
            expect(typeof error.message).toBe("string");
            expect(typeof error.location.line).toBe("number");
            expect(typeof error.location.column).toBe("number");
            expect(error.phase).toBe("instance-validation");
        });

        it("delivers errors through the listener and keeps result and listener in sync", () => {
            const schema = compile(MINIMAL_XSD);
            const seen: SchemaError[] = [];
            const { valid, errors } = check(`<root><foo>a</foo></root>`, schema, {
                listener: (e) => seen.push(e),
            });
            expect(valid).toBe(false);
            expect(seen).toEqual(errors);
        });

        it("validates the same compiled schema repeatedly without side effects", () => {
            const schema = compile(MINIMAL_XSD);
            expect(check(`<root><foo>a</foo><bar>b</bar></root>`, schema).valid).toBe(true);
            expect(check(`<root><foo>a</foo></root>`, schema).valid).toBe(false);
            expect(check(`<root><foo>a</foo><bar>b</bar></root>`, schema).valid).toBe(true);
            expect(check(`<root><foo>a</foo></root>`, schema).valid).toBe(false);
        });

    });

    describe("simple-type facet validation (CHK-010)", () => {

        it("validates minLength on a simple type restriction", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MinLen2">
                        <xsd:restriction base="xsd:string">
                            <xsd:minLength value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MinLen2"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>ab</e>`, schema).valid).toBe(true);
            expect(check(`<e>a</e>`, schema).valid).toBe(false);
            expect(check(`<e></e>`, schema).valid).toBe(false);
        });

        it("validates maxLength and length facets", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Exact3">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="3"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="Exact3"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>abc</e>`, schema).valid).toBe(true);
            expect(check(`<e>ab</e>`, schema).valid).toBe(false);
            expect(check(`<e>abcd</e>`, schema).valid).toBe(false);
        });

        it("reports FACET_VIOLATION with the correct code and facet name", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MinLen2">
                        <xsd:restriction base="xsd:string">
                            <xsd:minLength value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MinLen2"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const { errors } = check(`<e>a</e>`, schema);
            expect(errors[0]!.code).toBe("FACET_VIOLATION");
            expect(errors[0]!.severity).toBe("error");
            expect(errors[0]!.message).toContain("minLength");
        });

        it("validates enumeration facets", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Color">
                        <xsd:restriction base="xsd:string">
                            <xsd:enumeration value="red"/>
                            <xsd:enumeration value="green"/>
                            <xsd:enumeration value="blue"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="Color"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>red</e>`, schema).valid).toBe(true);
            expect(check(`<e>blue</e>`, schema).valid).toBe(true);
            expect(check(`<e>yellow</e>`, schema).valid).toBe(false);
        });

        it("applies whitespace normalization before facet checks (collapse → collapse)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Collapsed">
                        <xsd:restriction base="xsd:token">
                            <xsd:length value="3"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="Collapsed"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // "abc" has length 3 before normalization
            expect(check(`<e>abc</e>`, schema).valid).toBe(true);
            // "  abc  " normalizes to "abc" (collapse), length 3 → valid
            expect(check(`<e>  abc  </e>`, schema).valid).toBe(true);
            // "a b" normalizes to "a b" (collapse), length 3 → valid
            expect(check(`<e>a b</e>`, schema).valid).toBe(true);
        });

        it("applies whitespace normalization before facet checks (preserve → preserve)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Preserved">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="Preserved"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // "a b c" has 5 code points (preserve doesn't change anything)
            expect(check(`<e>a b c</e>`, schema).valid).toBe(true);
            // "a b  " has 5 code points (preserve), but "ab" has 2
            expect(check(`<e>ab</e>`, schema).valid).toBe(false);
        });

        it("validates inline simple type under an element", () => {
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
            const schema = compile(xsd);
            expect(check(`<e>a</e>`, schema).valid).toBe(true);
            expect(check(`<e></e>`, schema).valid).toBe(false);
        });

        it("validates attribute values against their simple type facets", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Size">
                        <xsd:restriction base="xsd:string">
                            <xsd:enumeration value="small"/>
                            <xsd:enumeration value="large"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute name="size" type="Size" use="required"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root size="small"/>`, schema).valid).toBe(true);
            expect(check(`<root size="large"/>`, schema).valid).toBe(true);
            expect(check(`<root size="medium"/>`, schema).valid).toBe(false);
        });

        it("validates text content in simpleContent complex types", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Label">
                        <xsd:simpleContent>
                            <xsd:restriction base="xsd:string">
                                <xsd:minLength value="1"/>
                                <xsd:maxLength value="10"/>
                            </xsd:restriction>
                        </xsd:simpleContent>
                    </xsd:complexType>
                    <xsd:element name="label" type="Label"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<label>hello</label>`, schema).valid).toBe(true);
            expect(check(`<label></label>`, schema).valid).toBe(false);
            expect(check(`<label>very long text here</label>`, schema).valid).toBe(false);
        });

        it("uses code-point counting for length facets (supplementary characters)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="EmojiLen">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="EmojiLen"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // "😀a" is 2 code points but 3 UTF-16 code units — must be valid
            expect(check(`<e>😀a</e>`, schema).valid).toBe(true);
            // "😀😀" is 2 code points, 4 UTF-16 units — must be valid
            expect(check(`<e>😀😀</e>`, schema).valid).toBe(true);
            // "😀" is 1 code point — must be invalid
            expect(check(`<e>😀</e>`, schema).valid).toBe(false);
        });

    });

    describe("string-family lexical-space validation (CHK-011)", () => {

        it("accepts valid NCName values and rejects invalid ones", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyNCN">
                        <xsd:restriction base="xsd:NCName">
                            <xsd:minLength value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MyNCN"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>validName</e>`, schema).valid).toBe(true);
            expect(check(`<e>_underscore</e>`, schema).valid).toBe(true);
            // NCName cannot contain colons
            const r1 = check(`<e>ns:bad</e>`, schema);
            expect(r1.valid).toBe(false);
            expect(r1.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
            // NCName cannot start with a digit
            const r2 = check(`<e>1nope</e>`, schema);
            expect(r2.valid).toBe(false);
            expect(r2.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates xs:Name values (allows colons, rejects digit-start)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyName">
                        <xsd:restriction base="xsd:Name">
                            <xsd:minLength value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MyName"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>validName</e>`, schema).valid).toBe(true);
            expect(check(`<e>ns:prefixed</e>`, schema).valid).toBe(true);
            // Name cannot start with a digit
            const r = check(`<e>1nope</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates xs:NMTOKEN (any combination of NameChars including digits first)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyTok">
                        <xsd:restriction base="xsd:NMTOKEN">
                            <xsd:minLength value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MyTok"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>valid</e>`, schema).valid).toBe(true);
            expect(check(`<e>123</e>`, schema).valid).toBe(true);
            expect(check(`<e>-hyphen</e>`, schema).valid).toBe(true);
            // NMTOKEN cannot contain spaces
            const r = check(`<e>bad value</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("reports both LEXICAL_SPACE_VIOLATION and FACET_VIOLATION when both fail", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="ShortNCN">
                        <xsd:restriction base="xsd:NCName">
                            <xsd:minLength value="3"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="ShortNCN"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // "ab" fails both: not an NCName (actually it is an NCName since it passes isNameStartChar)
            // Let's use something that fails both: "1" fails NCName and minLength
            const { errors } = check(`<e>1</e>`, schema);
            const lexicalErrors = errors.filter((e) => e.code === "LEXICAL_SPACE_VIOLATION");
            const facetErrors = errors.filter((e) => e.code === "FACET_VIOLATION");
            expect(lexicalErrors.length).toBeGreaterThanOrEqual(1);
            expect(facetErrors.length).toBeGreaterThanOrEqual(1);
        });

        it("validates NMTOKENS as a space-separated list of NMTOKEN", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyToks">
                        <xsd:restriction base="xsd:NMTOKENS">
                            <xsd:minLength value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MyToks"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>tok1 tok2 tok3</e>`, schema).valid).toBe(true);
            // Each NMTOKEN individually valid
            expect(check(`<e>123 abc _foo</e>`, schema).valid).toBe(true);
            // Invalid NMTOKENS value: one token has invalid char
            const r = check(`<e>tok1 invalid@tok tok3</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates language through the end-to-end pipeline", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyLang">
                        <xsd:restriction base="xsd:language">
                            <xsd:minLength value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MyLang"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>en</e>`, schema).valid).toBe(true);
            expect(check(`<e>en-US</e>`, schema).valid).toBe(true);
            expect(check(`<e>sgn-US</e>`, schema).valid).toBe(true);
            // Violates language lexical space (uppercase in the middle matches the pattern)
            const r = check(`<e>en@us</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates attribute values against NCName (xs:ID / xs:IDREF)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyId">
                        <xsd:restriction base="xsd:ID">
                            <xsd:minLength value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute name="id" type="MyId" use="required"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root id="validId"/>`, schema).valid).toBe(true);
            // ID cannot contain colons
            const r = check(`<root id="ns:bad"/>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates ENTITIES as space-separated list of NCName", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyEnts">
                        <xsd:restriction base="xsd:ENTITIES">
                            <xsd:minLength value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MyEnts"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>ent1 ent2 ent3</e>`, schema).valid).toBe(true);
            const r = check(`<e>ent1 ns:bad ent3</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("passes through for xs:string directly (no lexical check)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="e" type="xsd:string"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>any value at all !@#$%</e>`, schema).valid).toBe(true);
            expect(check(`<e></e>`, schema).valid).toBe(true);
        });

        it("passes through for xs:token-derived types (whitespace handles it)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="MyTok">
                        <xsd:restriction base="xsd:token">
                            <xsd:minLength value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="MyTok"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // Whitespace gets collapsed, so this is valid
            expect(check(`<e>  abc  </e>`, schema).valid).toBe(true);
        });

    });

    describe("remaining-family lexical-space validation (CHK-014)", () => {

        it("validates xs:boolean with whitespace collapse", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="e" type="xsd:boolean"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>true</e>`, schema).valid).toBe(true);
            expect(check(`<e>false</e>`, schema).valid).toBe(true);
            expect(check(`<e>1</e>`, schema).valid).toBe(true);
            expect(check(`<e>0</e>`, schema).valid).toBe(true);
            // Whitespace is collapsed before lexing
            expect(check(`<e>  true  </e>`, schema).valid).toBe(true);
            // Invalid boolean
            const r = check(`<e>yes</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates xs:hexBinary", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="e" type="xsd:hexBinary"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>0FB7</e>`, schema).valid).toBe(true);
            expect(check(`<e>deadbeef</e>`, schema).valid).toBe(true);
            expect(check(`<e></e>`, schema).valid).toBe(true); // empty = zero octets
            // Odd number of hex digits
            const r = check(`<e>0FB</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates length facet in octets for hexBinary", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="TwoOctetHex">
                        <xsd:restriction base="xsd:hexBinary">
                            <xsd:length value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="TwoOctetHex"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // "0FB7" = 2 octets (4 hex digits)
            expect(check(`<e>0FB7</e>`, schema).valid).toBe(true);
            // "0F" = 1 octet, violates length=2
            const r = check(`<e>0F</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "FACET_VIOLATION")).toBe(true);
        });

        it("validates xs:base64Binary", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="e" type="xsd:base64Binary"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>Zm9v</e>`, schema).valid).toBe(true); // "foo"
            expect(check(`<e>Zm8=</e>`, schema).valid).toBe(true); // "fo"
            expect(check(`<e>Zg==</e>`, schema).valid).toBe(true); // "f"
            expect(check(`<e></e>`, schema).valid).toBe(true); // empty
            // Invalid base64 (length not multiple of 4)
            const r = check(`<e>Zm9vZ</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates length facet in octets for base64Binary", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="OneOctetB64">
                        <xsd:restriction base="xsd:base64Binary">
                            <xsd:length value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="OneOctetB64"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // "Zg==" = 1 octet
            expect(check(`<e>Zg==</e>`, schema).valid).toBe(true);
            // "Zm8=" = 2 octets, violates length=1
            const r = check(`<e>Zm8=</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "FACET_VIOLATION")).toBe(true);
        });

        it("validates xs:anyURI", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="e" type="xsd:anyURI"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>http://example.com</e>`, schema).valid).toBe(true);
            expect(check(`<e>../relative</e>`, schema).valid).toBe(true);
            expect(check(`<e></e>`, schema).valid).toBe(true); // empty is valid
            // Control characters are rejected
            const r = check(`<e>http://example.com/\npath</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates xs:QName lexical form", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="e" type="xsd:QName"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>foo</e>`, schema).valid).toBe(true);
            expect(check(`<e>ns:foo</e>`, schema).valid).toBe(true);
            // Multiple colons not allowed
            const r = check(`<e>a:b:c</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("validates xs:NOTATION lexical form (same as QName)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="e" type="xsd:NOTATION"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>foo</e>`, schema).valid).toBe(true);
            expect(check(`<e>ns:foo</e>`, schema).valid).toBe(true);
            // Empty string not allowed for QName/NOTATION
            const r = check(`<e></e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

    });

    describe("list and union types (CHK-016)", () => {

        it("validates a list of integers item by item", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="IntList">
                        <xsd:list itemType="xsd:integer"/>
                    </xsd:simpleType>
                    <xsd:element name="e" type="IntList"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>1 2 3</e>`, schema).valid).toBe(true);
            expect(check(`<e> -1 0 42 </e>`, schema).valid).toBe(true); // collapse trims
            // "1 2 x" — "x" is not a valid integer item
            const r = check(`<e>1 2 x</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("applies length/minLength/maxLength to the item count, not code points", () => {
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
                    <xsd:simpleType name="MinTwo">
                        <xsd:restriction base="IntList">
                            <xsd:minLength value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="exact" type="TwoInts"/>
                    <xsd:element name="min" type="MinTwo"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<exact>1 2</exact>`, schema).valid).toBe(true);
            expect(check(`<exact>1 2 3</exact>`, schema).valid).toBe(false);
            expect(check(`<exact>1</exact>`, schema).valid).toBe(false);
            expect(check(`<min>1 2 3</min>`, schema).valid).toBe(true);
            expect(check(`<min>1</min>`, schema).valid).toBe(false);
            const { errors } = check(`<exact>1 2 3</exact>`, schema);
            expect(errors.some((e) => e.code === "FACET_VIOLATION" && e.message.includes("length"))).toBe(true);
        });

        it("applies pattern and enumeration to the whole list lexical form", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="DigitList">
                        <xsd:list itemType="xsd:token"/>
                    </xsd:simpleType>
                    <xsd:simpleType name="Patterned">
                        <xsd:restriction base="DigitList">
                            <xsd:pattern value="\\d+ \\d+"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:simpleType name="Enumerated">
                        <xsd:restriction base="DigitList">
                            <xsd:enumeration value="red green blue"/>
                            <xsd:enumeration value="1 2 3"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="p" type="Patterned"/>
                    <xsd:element name="q" type="Enumerated"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<p>12 34</p>`, schema).valid).toBe(true);
            expect(check(`<p>ab cd</p>`, schema).valid).toBe(false);
            expect(check(`<q>1 2 3</q>`, schema).valid).toBe(true);
            expect(check(`<q>red green blue</q>`, schema).valid).toBe(true);
            expect(check(`<q>2 3 4</q>`, schema).valid).toBe(false);
        });

        it("applies item-type facets to each item (inline item type)", () => {
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
                    <xsd:element name="e" type="TwoCharTokens"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>ab cd</e>`, schema).valid).toBe(true);
            expect(check(`<e>abc d</e>`, schema).valid).toBe(false); // "abc" has length 3
            const { errors } = check(`<e>abc d</e>`, schema);
            expect(errors.some((e) => e.code === "FACET_VIOLATION" && e.message.includes("List item"))).toBe(true);
        });

        it("accepts a union value when at least one member type accepts it", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="IntOrDate">
                        <xsd:union memberTypes="xsd:integer xsd:date"/>
                    </xsd:simpleType>
                    <xsd:element name="e" type="IntOrDate"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>2020</e>`, schema).valid).toBe(true); // integer member
            expect(check(`<e>2000-01-01</e>`, schema).valid).toBe(true); // date member
            const r = check(`<e>hello</e>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "UNION_VIOLATION")).toBe(true);
        });

        it("applies each union member's own whitespace normalization", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="BoolOrToken">
                        <xsd:union memberTypes="xsd:boolean xsd:token"/>
                    </xsd:simpleType>
                    <xsd:element name="e" type="BoolOrToken"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // The union's own whiteSpace is preserve, but the boolean member
            // collapses whitespace, so the padded value is accepted.
            expect(check(`<e> true </e>`, schema).valid).toBe(true);
            expect(check(`<e>false</e>`, schema).valid).toBe(true);
            expect(check(`<e>1</e>`, schema).valid).toBe(true);
        });

        it("supports anonymous inline union member types", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="StrOrTwo">
                        <xsd:union>
                            <xsd:simpleType>
                                <xsd:restriction base="xsd:string">
                                    <xsd:length value="2"/>
                                </xsd:restriction>
                            </xsd:simpleType>
                            <xsd:simpleType>
                                <xsd:restriction base="xsd:integer">
                                    <xsd:minInclusive value="0"/>
                                </xsd:restriction>
                            </xsd:simpleType>
                        </xsd:union>
                    </xsd:simpleType>
                    <xsd:element name="e" type="StrOrTwo"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>ab</e>`, schema).valid).toBe(true); // 2-char string
            expect(check(`<e>5</e>`, schema).valid).toBe(true); // non-negative integer
            expect(check(`<e>-5</e>`, schema).valid).toBe(true); // 2 chars, via the string member
            expect(check(`<e>abc</e>`, schema).valid).toBe(false); // neither
            expect(check(`<e>-55</e>`, schema).valid).toBe(false); // negative integer, 3 chars
        });

        it("applies enumeration/pattern facets on a restriction of a union", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="IntOrDate">
                        <xsd:union memberTypes="xsd:integer xsd:date"/>
                    </xsd:simpleType>
                    <xsd:simpleType name="YearOnly">
                        <xsd:restriction base="IntOrDate">
                            <xsd:enumeration value="2020"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="e" type="YearOnly"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e>2020</e>`, schema).valid).toBe(true);
            expect(check(`<e>2021</e>`, schema).valid).toBe(false);
            const { errors } = check(`<e>2021</e>`, schema);
            expect(errors.some((e) => e.code === "FACET_VIOLATION" && e.message.includes("enumeration"))).toBe(true);
        });

        it("validates list types on attributes", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="IntList">
                        <xsd:list itemType="xsd:integer"/>
                    </xsd:simpleType>
                    <xsd:element name="e">
                        <xsd:complexType>
                            <xsd:attribute name="vals" type="IntList" use="required"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e vals="1 2 3"/>`, schema).valid).toBe(true);
            expect(check(`<e vals="1 x"/>`, schema).valid).toBe(false);
        });

        it("the empty string is the empty list and is valid without length facets", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="IntList">
                        <xsd:list itemType="xsd:integer"/>
                    </xsd:simpleType>
                    <xsd:element name="e" type="IntList"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<e></e>`, schema).valid).toBe(true);
        });

    });

    describe("element and attribute references (CHK-017)", () => {

        it("validates instance elements via a ref= to a global declaration", () => {
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
            const schema = compile(xsd);
            expect(check(`<root><child>x</child></root>`, schema).valid).toBe(true);
            // A ref'd element is not anyType — its declared type is enforced.
            const { valid, errors } = check(`<root><child><nested/></child></root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "INVALID_ELEMENT_CONTENT")).toBe(true);
            // A missing required ref'd particle is reported.
            const missing = check(`<root></root>`, schema);
            expect(missing.valid).toBe(false);
            expect(missing.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT")).toBe(true);
        });

        it("enforces the referenced element's type on instance values", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="count"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="count" type="xsd:integer"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><count>42</count></root>`, schema).valid).toBe(true);
            expect(check(`<root><count>not-an-int</count></root>`, schema).valid).toBe(false);
        });

        it("honors occurrence bounds on the ref particle itself", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="item" minOccurs="0" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="item" type="xsd:string"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><item>a</item><item>b</item><item>c</item></root>`, schema).valid).toBe(true);
            expect(check(`<root></root>`, schema).valid).toBe(true);
        });

        it("validates attributes via a ref= to a global declaration", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:attribute name="size" type="xsd:string"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute ref="size" use="required"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root size="m"/>`, schema).valid).toBe(true);
            const r1 = check(`<root/>`, schema);
            expect(r1.valid).toBe(false);
            expect(r1.errors.some((e) => e.code === "MISSING_REQUIRED_ATTRIBUTE")).toBe(true);
            // Undeclared attributes are still rejected alongside the ref'd one.
            expect(check(`<root size="m" other="x"/>`, schema).valid).toBe(false);
        });

        it("enforces the referenced attribute's type on instance values", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:attribute name="count" type="xsd:integer"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute ref="count"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root count="7"/>`, schema).valid).toBe(true);
            expect(check(`<root count="abc"/>`, schema).valid).toBe(false);
        });

    });

    describe("namespace-aware matching (CHK-017)", () => {

        it("matches qualified local elements by namespace under elementFormDefault=qualified", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:books" xmlns:b="urn:books" elementFormDefault="qualified">
                    <xsd:element name="books" type="b:BooksType"/>
                    <xsd:complexType name="BooksType">
                        <xsd:sequence>
                            <xsd:element name="book" type="b:BookType" minOccurs="0" maxOccurs="unbounded"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="BookType">
                        <xsd:sequence>
                            <xsd:element name="title" type="xsd:string"/>
                        </xsd:sequence>
                        <xsd:attribute name="id" type="xsd:string"/>
                    </xsd:complexType>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // Qualified children (default namespace = urn:books) validate.
            const valid = `<b:books xmlns:b="urn:books" xmlns="urn:books"><book id="b1"><title>T</title></book></b:books>`;
            expect(check(valid, schema).valid).toBe(true);
            // An element explicitly pushed out of the namespace is rejected.
            const invalid = `<b:books xmlns:b="urn:books"><book xmlns="" id="b1"><title>T</title></book></b:books>`;
            const { valid: v, errors } = check(invalid, schema);
            expect(v).toBe(false);
            expect(errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
        });

        it("matches ref'd global elements across prefixes in the same namespace", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:co" xmlns:c="urn:co">
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
            const schema = compile(xsd);
            expect(check(`<c:root xmlns:c="urn:co"><c:child>hi</c:child></c:root>`, schema).valid).toBe(true);
            // The same local name in a different namespace does not match.
            const { valid, errors } = check(`<c:root xmlns:c="urn:co"><x:child xmlns:x="urn:other">hi</x:child></c:root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
        });

        it("matches a qualified global attribute ref by namespace (attributes never take a default namespace)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:co" xmlns:c="urn:co">
                    <xsd:attribute name="id" type="xsd:string"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute ref="c:id"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // The global attribute is in urn:co, so the instance must prefix it.
            expect(check(`<c:root xmlns:c="urn:co" c:id="a"/>`, schema).valid).toBe(true);
            // An unprefixed instance attribute is in no namespace and does not match.
            const { valid, errors } = check(`<c:root xmlns:c="urn:co" id="a"/>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "UNDECLARED_ATTRIBUTE")).toBe(true);
        });

    });

    describe("named model groups and attribute groups (CHK-019)", () => {

        describe("model groups", () => {

            it("validates an instance using a group ref, identical to the inlined equivalent", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:group name="Item">
                            <xsd:sequence>
                                <xsd:element name="name" type="xsd:string"/>
                                <xsd:element name="price" type="xsd:decimal"/>
                            </xsd:sequence>
                        </xsd:group>
                        <xsd:complexType name="Order">
                            <xsd:sequence>
                                <xsd:group ref="Item" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:element name="order" type="Order"/>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                // Valid: two items
                expect(check(`<order><name>foo</name><price>10.0</price><name>bar</name><price>20.0</price></order>`, schema).valid).toBe(true);
                // Invalid: missing price in second item
                const r = check(`<order><name>foo</name><price>10.0</price><name>bar</name></order>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT")).toBe(true);
            });

            it("validates a group ref with minOccurs=0 (optional group)", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:group name="OptGroup">
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:group>
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:sequence>
                                    <xsd:group ref="OptGroup" minOccurs="0"/>
                                    <xsd:element name="b" type="xsd:string"/>
                                </xsd:sequence>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                // Valid: group absent
                expect(check(`<root><b>ok</b></root>`, schema).valid).toBe(true);
                // Valid: group present
                expect(check(`<root><a>ok</a><b>ok</b></root>`, schema).valid).toBe(true);
                // Invalid: group present but incomplete
                const r = check(`<root><a>ok</a></root>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT" && e.message.includes("b"))).toBe(true);
            });

            it("validates a repeating group ref (maxOccurs=unbounded)", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:group name="G">
                            <xsd:choice>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="b" type="xsd:string"/>
                            </xsd:choice>
                        </xsd:group>
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:choice maxOccurs="unbounded">
                                    <xsd:group ref="G"/>
                                </xsd:choice>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<root></root>`, schema).valid).toBe(true);
                expect(check(`<root><a>1</a><b>2</b><a>3</a></root>`, schema).valid).toBe(true);
                // Only a and b allowed
                const r = check(`<root><a>1</a><c>3</c></root>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "UNEXPECTED_ELEMENT" && e.message.includes("c"))).toBe(true);
            });

            it("a choice containing group refs matches correctly", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:group name="G1">
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="b" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:group>
                        <xsd:group name="G2">
                            <xsd:sequence>
                                <xsd:element name="c" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:group>
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:choice>
                                    <xsd:group ref="G1"/>
                                    <xsd:group ref="G2"/>
                                </xsd:choice>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<root><a>1</a><b>2</b></root>`, schema).valid).toBe(true);
                expect(check(`<root><c>3</c></root>`, schema).valid).toBe(true);
                // G1 partial — not valid (a without b)
                const r = check(`<root><a>1</a></root>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT")).toBe(true);
            });

        });

        describe("attribute groups", () => {

            it("validates attributes defined via an attribute group ref", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:attributeGroup name="CommonAttrs">
                            <xsd:attribute name="id" type="xsd:string" use="required"/>
                            <xsd:attribute name="lang" type="xsd:string"/>
                        </xsd:attributeGroup>
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:attributeGroup ref="CommonAttrs"/>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<root id="x" lang="en"/>`, schema).valid).toBe(true);
                expect(check(`<root id="x"/>`, schema).valid).toBe(true);
                // Missing required id
                const r = check(`<root lang="en"/>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "MISSING_REQUIRED_ATTRIBUTE" && e.message.includes("id"))).toBe(true);
            });

            it("validates an attribute group ref with type resolution", () => {
                const xsd = `
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:simpleType name="NonEmpty">
                            <xsd:restriction base="xsd:string">
                                <xsd:minLength value="1"/>
                            </xsd:restriction>
                        </xsd:simpleType>
                        <xsd:attributeGroup name="IdAttr">
                            <xsd:attribute name="id" type="NonEmpty" use="required"/>
                        </xsd:attributeGroup>
                        <xsd:element name="root">
                            <xsd:complexType>
                                <xsd:attributeGroup ref="IdAttr"/>
                            </xsd:complexType>
                        </xsd:element>
                    </xsd:schema>
                `;
                const schema = compile(xsd);
                expect(check(`<root id="ok"/>`, schema).valid).toBe(true);
                // minLength=1 violated
                const r = check(`<root id=""/>`, schema);
                expect(r.valid).toBe(false);
                expect(r.errors.some((e) => e.code === "FACET_VIOLATION")).toBe(true);
            });

        });

    });

});

describe("complex content derivation — end to end (CHK-020)", () => {

    describe("complexContent extension", () => {

        const EXT_XSD = `
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
                            <xsd:attribute name="count" type="xsd:int"/>
                        </xsd:extension>
                    </xsd:complexContent>
                </xsd:complexType>
                <xsd:element name="root" type="Derived"/>
            </xsd:schema>
        `;

        it("accepts base + derived children in order with both base and derived attributes", () => {
            const schema = compile(EXT_XSD);
            const r = check(`<root lang="en" count="2"><a>x</a><b>42</b></root>`, schema);
            expect(r.valid).toBe(true);
            expect(r.errors).toHaveLength(0);
        });

        it("rejects out-of-order children (greedy match)", () => {
            const schema = compile(EXT_XSD);
            const r = check(`<root><b>1</b><a>x</a></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
        });

        it("rejects an instance missing the base's required element", () => {
            const schema = compile(EXT_XSD);
            const r = check(`<root><b>1</b></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT")).toBe(true);
        });

        it("validates values against the inherited and added attribute types", () => {
            const schema = compile(EXT_XSD);
            expect(check(`<root lang="en"><a>x</a><b>1</b></root>`, schema).valid).toBe(true);
            // count is xs:int — a non-numeric value must fail
            const r = check(`<root lang="en" count="NaN"><a>x</a><b>1</b></root>`, schema);
            expect(r.valid).toBe(false);
        });

        it("rejects character data inside an element-only extension type", () => {
            const schema = compile(EXT_XSD);
            const r = check(`<root lang="en">text<a>x</a><b>1</b></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "UNEXPECTED_TEXT_CONTENT")).toBe(true);
        });

    });

    describe("simpleContent extension", () => {

        const SC_XSD = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="Count">
                    <xsd:simpleContent>
                        <xsd:extension base="xsd:int">
                            <xsd:attribute name="unit" type="xsd:string"/>
                        </xsd:extension>
                    </xsd:simpleContent>
                </xsd:complexType>
                <xsd:element name="count" type="Count"/>
            </xsd:schema>
        `;

        it("validates text against the inherited simple type and allows attributes", () => {
            const schema = compile(SC_XSD);
            expect(check(`<count unit="kg">42</count>`, schema).valid).toBe(true);
        });

        it("rejects text that violates the base simple type lexicography", () => {
            const schema = compile(SC_XSD);
            const r = check(`<count>not-a-number</count>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
        });

        it("rejects element children inside simple content", () => {
            const schema = compile(SC_XSD);
            const r = check(`<count><child/></count>`, schema);
            expect(r.valid).toBe(false);
        });

        it("validates the attribute value against its declared type", () => {
            const schema = compile(SC_XSD);
            const r = check(`<count unit="42">7</count>`, schema);
            // unit is xs:string so "42" is fine; the issue would be an int-typed attr
            expect(r.valid).toBe(true);
        });

    });

    describe("simpleContent restriction", () => {

        it("enforces facets and keeps redeclared attributes", () => {
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
                    <xsd:element name="root" type="Derived"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root lang="en">hello</root>`, schema).valid).toBe(true);
            const tooLong = check(`<root lang="en">way too long</root>`, schema);
            expect(tooLong.valid).toBe(false);
            expect(tooLong.errors.some((e) => e.code === "FACET_VIOLATION")).toBe(true);
        });

        it("drops attributes not redeclared in the restriction", () => {
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
                            </xsd:restriction>
                        </xsd:simpleContent>
                    </xsd:complexType>
                    <xsd:element name="root" type="Derived"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root>hello</root>`, schema).valid).toBe(true);
            const withLang = check(`<root lang="en">hello</root>`, schema);
            expect(withLang.valid).toBe(false);
            expect(withLang.errors.some((e) => e.code === "UNDECLARED_ATTRIBUTE")).toBe(true);
        });

    });

    describe("complexContent restriction", () => {

        it("enforces the restricted content model on instances", () => {
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
                    <xsd:element name="root" type="Derived"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><b>x</b><b>y</b></root>`, schema).valid).toBe(true);
            const three = check(`<root><b>x</b><b>y</b><b>z</b></root>`, schema);
            expect(three.valid).toBe(false);
            expect(three.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
            // a is dropped entirely — an instance using it is invalid
            const withA = check(`<root><a>x</a></root>`, schema);
            expect(withA.valid).toBe(false);
        });

    });

    describe("mixed content", () => {

        it("allows character data interleaved with validated elements", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="Mixed" mixed="true">
                        <xsd:sequence>
                            <xsd:element name="em" type="xsd:string" minOccurs="0"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:element name="root" type="Mixed"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root>text<em>x</em>more</root>`, schema).valid).toBe(true);
            expect(check(`<root>just text</root>`, schema).valid).toBe(true);
            expect(check(`<root/>`, schema).valid).toBe(true);
            const bad = check(`<root><em>x</em><other>y</other></root>`, schema);
            expect(bad.valid).toBe(false);
            expect(bad.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
        });

        it("mixed without a compositor allows character data but no element children", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="MixedEmpty" mixed="true"/>
                    <xsd:element name="root" type="MixedEmpty"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root>text</root>`, schema).valid).toBe(true);
            const child = check(`<root><em>x</em></root>`, schema);
            expect(child.valid).toBe(false);
            expect(child.errors.some((e) => e.code === "INVALID_ELEMENT_CONTENT")).toBe(true);
        });

    });

});

describe("wildcards — xs:any and xs:anyAttribute (CHK-021)", () => {

    describe("xs:any namespace constraints", () => {

        const ANY_SCHEMA = (ns: string) => `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:any namespace="${ns}" processContents="skip"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;

        it("##any (default) accepts elements from any namespace and no namespace", () => {
            const schema = compile(ANY_SCHEMA("##any"));
            expect(check(`<t:root xmlns:t="urn:t"><a/></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><a xmlns="urn:other"/></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t" xmlns=""><a/></t:root>`, schema).valid).toBe(true);
        });

        it("##other accepts namespaced elements except the target namespace", () => {
            const schema = compile(ANY_SCHEMA("##other"));
            expect(check(`<t:root xmlns:t="urn:t"><a xmlns="urn:other"/></t:root>`, schema).valid).toBe(true);
            // No namespace: not matched by ##other (absent never matches a negation, §3.10.4).
            expect(check(`<t:root xmlns:t="urn:t"><a/></t:root>`, schema).valid).toBe(false);
            // Target namespace: rejected.
            const bad = check(`<t:root xmlns:t="urn:t"><t:a/></t:root>`, schema);
            expect(bad.valid).toBe(false);
            expect(bad.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
        });

        it("##targetNamespace accepts only elements in the target namespace", () => {
            const schema = compile(ANY_SCHEMA("##targetNamespace"));
            expect(check(`<t:root xmlns:t="urn:t"><t:a/></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><a xmlns="urn:other"/></t:root>`, schema).valid).toBe(false);
            expect(check(`<t:root xmlns:t="urn:t"><a/></t:root>`, schema).valid).toBe(false);
        });

        it("##local accepts only elements in no namespace", () => {
            const schema = compile(ANY_SCHEMA("##local"));
            expect(check(`<t:root xmlns:t="urn:t"><a/></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><t:a/></t:root>`, schema).valid).toBe(false);
            expect(check(`<t:root xmlns:t="urn:t"><a xmlns="urn:other"/></t:root>`, schema).valid).toBe(false);
        });

        it("an explicit list accepts only the listed namespaces", () => {
            const schema = compile(ANY_SCHEMA("urn:a urn:b"));
            expect(check(`<t:root xmlns:t="urn:t"><a xmlns="urn:a"/></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><a xmlns="urn:b"/></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><a xmlns="urn:c"/></t:root>`, schema).valid).toBe(false);
        });

        it("an explicit list may mix ##targetNamespace and ##local", () => {
            const schema = compile(ANY_SCHEMA("##targetNamespace ##local"));
            expect(check(`<t:root xmlns:t="urn:t"><t:a/></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><a/></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><a xmlns="urn:other"/></t:root>`, schema).valid).toBe(false);
        });

    });

    describe("xs:any processContents", () => {

        const GLOBAL = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                <xsd:element name="known" type="xsd:int"/>
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:any processContents="%PC%" namespace="##any"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;

        it("strict validates wildcard-matched elements against their declaration and rejects undeclared ones", () => {
            const schema = compile(GLOBAL.replace("%PC%", "strict"));
            expect(check(`<t:root xmlns:t="urn:t"><t:known>42</t:known></t:root>`, schema).valid).toBe(true);
            const undeclared = check(`<t:root xmlns:t="urn:t"><t:ghost/></t:root>`, schema);
            expect(undeclared.valid).toBe(false);
            expect(undeclared.errors.some((e) => e.code === "UNDECLARED_ELEMENT")).toBe(true);
            // Declared element with a bad value is validated.
            const badValue = check(`<t:root xmlns:t="urn:t"><t:known>not-an-int</t:known></t:root>`, schema);
            expect(badValue.valid).toBe(false);
        });

        it("lax validates when a declaration exists and skips undeclared elements", () => {
            const schema = compile(GLOBAL.replace("%PC%", "lax"));
            expect(check(`<t:root xmlns:t="urn:t"><t:known>42</t:known></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><t:ghost/></t:root>`, schema).valid).toBe(true);
            const badValue = check(`<t:root xmlns:t="urn:t"><t:known>not-an-int</t:known></t:root>`, schema);
            expect(badValue.valid).toBe(false);
        });

        it("skip validates nothing — not even declared elements with bad values", () => {
            const schema = compile(GLOBAL.replace("%PC%", "skip"));
            expect(check(`<t:root xmlns:t="urn:t"><t:known>not-an-int</t:known></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><t:ghost/></t:root>`, schema).valid).toBe(true);
        });

        it("wildcard occurrence minOccurs/maxOccurs are enforced", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:any processContents="skip" namespace="##any" minOccurs="2" maxOccurs="3"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<t:root xmlns:t="urn:t"><a/><b/></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><a/><b/><c/><d/></t:root>`, schema).valid).toBe(false);
            const missing = check(`<t:root xmlns:t="urn:t"><a/></t:root>`, schema);
            expect(missing.valid).toBe(false);
            expect(missing.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT")).toBe(true);
        });

        it("a wildcard inside a choice matches any allowed alternative", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:choice>
                                <xsd:element name="fixed" type="xsd:string"/>
                                <xsd:any processContents="skip" namespace="##other"/>
                            </xsd:choice>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<t:root xmlns:t="urn:t"><t:fixed>x</t:fixed></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><a xmlns="urn:other"/></t:root>`, schema).valid).toBe(true);
            // Target-namespace element other than fixed matches neither alternative.
            expect(check(`<t:root xmlns:t="urn:t"><t:other/></t:root>`, schema).valid).toBe(false);
        });

        it("a wildcard inside a sequence with mixed element/wildcard particles works", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string" minOccurs="0"/>
                                <xsd:any processContents="skip" namespace="##other" maxOccurs="unbounded"/>
                                <xsd:element name="b" type="xsd:string" minOccurs="0"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // Wildcard matches the middle elements
            expect(check(`<t:root xmlns:t="urn:t"><t:a>x</t:a><x xmlns="urn:o"/><t:b>y</t:b></t:root>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t"><t:a>x</t:a><x xmlns="urn:o"/><y xmlns="urn:o"/><t:b>y</t:b></t:root>`, schema).valid).toBe(true);
            // Target-namespace elements are not matched by ##other
            const bad = check(`<t:root xmlns:t="urn:t"><t:a>x</t:a><t:other/></t:root>`, schema);
            expect(bad.valid).toBe(false);
        });

    });

    describe("xs:anyAttribute", () => {

        it("accepts attributes matching the namespace constraint", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:anyAttribute namespace="urn:extra ##local" processContents="lax"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<t:root xmlns:t="urn:t" x="1" e:a="2" xmlns:e="urn:extra"/>`, schema).valid).toBe(true);
            const bad = check(`<t:root xmlns:t="urn:t" x="1" e:a="2" f:a="3" xmlns:e="urn:extra" xmlns:f="urn:forbidden"/>`, schema);
            expect(bad.valid).toBe(false);
            expect(bad.errors.some((e) => e.code === "UNDECLARED_ATTRIBUTE")).toBe(true);
        });

        it("strict requires a declaration for wildcard-matched attributes", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:attribute name="good" type="xsd:int"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:anyAttribute namespace="##any" processContents="strict"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // The global declaration is {urn:t}good; the instance attribute must
            // be qualified to match it.
            expect(check(`<t:root xmlns:t="urn:t" t:good="42"/>`, schema).valid).toBe(true);
            const undeclared = check(`<t:root xmlns:t="urn:t" t:other="1"/>`, schema);
            expect(undeclared.valid).toBe(false);
            expect(undeclared.errors.some((e) => e.code === "UNDECLARED_ATTRIBUTE")).toBe(true);
            // Declared attribute with a bad value is validated.
            const badValue = check(`<t:root xmlns:t="urn:t" t:good="nope"/>`, schema);
            expect(badValue.valid).toBe(false);
        });

        it("skip accepts anything and validates nothing", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:attribute name="good" type="xsd:int"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:anyAttribute namespace="##any" processContents="skip"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<t:root xmlns:t="urn:t" good="not-an-int" other="whatever"/>`, schema).valid).toBe(true);
        });

        it("is inherited through complexContent extension (union of wildcards)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:complexType name="Base">
                        <xsd:anyAttribute namespace="urn:a" processContents="lax"/>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:extension base="t:Base">
                                <xsd:anyAttribute namespace="urn:b" processContents="lax"/>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                    <xsd:element name="root" type="t:Derived"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // Both the base's and the derived's namespaces are allowed (union).
            expect(check(`<t:root xmlns:t="urn:t" x:a="1" xmlns:x="urn:a"/>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t" y:b="1" xmlns:y="urn:b"/>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t" z:c="1" xmlns:z="urn:c"/>`, schema).valid).toBe(false);
        });

        it("a restriction may tighten the attribute wildcard namespace constraint", () => {
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
                    <xsd:element name="root" type="t:Derived"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<t:root xmlns:t="urn:t" x:a="1" xmlns:x="urn:a"/>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t" y:b="1" xmlns:y="urn:b"/>`, schema).valid).toBe(false);
        });

        it("an attribute group's anyAttribute is inherited by complex types referencing it", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" targetNamespace="urn:t" xmlns:t="urn:t" elementFormDefault="qualified">
                    <xsd:attributeGroup name="Extras">
                        <xsd:attribute name="note" type="xsd:string"/>
                        <xsd:anyAttribute namespace="urn:extra" processContents="lax"/>
                    </xsd:attributeGroup>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attributeGroup ref="t:Extras"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<t:root xmlns:t="urn:t" note="hi" x:e="1" xmlns:x="urn:extra"/>`, schema).valid).toBe(true);
            expect(check(`<t:root xmlns:t="urn:t" note="hi" y:o="1" xmlns:y="urn:other"/>`, schema).valid).toBe(false);
        });

    });

});

describe("identity constraints — key, unique, keyref (CHK-022)", () => {

    describe("XPath-subset evaluator", () => {

        it("selects .// descendants", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="uuid">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="@val"/>
                        </xsd:unique>
                    </xsd:element>
                    <xsd:element name="uid">
                        <xsd:complexType>
                            <xsd:attribute name="val" type="xsd:string"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // All unique val values
            expect(check(`<root><uid val="1"/><uid val="2"/><uid val="3"/></root>`, schema).valid).toBe(true);
            // Duplicate val values
            const r = check(`<root><uid val="1"/><uid val="1"/></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "IDENTITY_CONSTRAINT_VIOLATION")).toBe(true);
        });

        it("handles * wildcard in selector", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" maxOccurs="unbounded" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath=".//*"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><a>1</a><a>2</a></root>`, schema).valid).toBe(true);
            expect(check(`<root><a>1</a><a>1</a></root>`, schema).valid).toBe(false);
        });

        it("evaluates child axis with / steps", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="container" maxOccurs="unbounded">
                                    <xsd:complexType>
                                        <xsd:sequence>
                                            <xsd:element name="item" type="xsd:string"/>
                                        </xsd:sequence>
                                    </xsd:complexType>
                                </xsd:element>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath=".//container/item"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><container><item>a</item></container><container><item>b</item></container></root>`, schema).valid).toBe(true);
            expect(check(`<root><container><item>a</item></container><container><item>a</item></container></root>`, schema).valid).toBe(false);
        });

        it("evaluates field attribute @ syntax", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" maxOccurs="unbounded">
                                    <xsd:complexType>
                                        <xsd:attribute name="id" type="xsd:string"/>
                                    </xsd:complexType>
                                </xsd:element>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath=".//a"/>
                            <xsd:field xpath="@id"/>
                        </xsd:unique>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><a id="x"/><a id="y"/></root>`, schema).valid).toBe(true);
            expect(check(`<root><a id="x"/><a id="x"/></root>`, schema).valid).toBe(false);
        });

        it("evaluates the self axis .", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                    </xsd:element>
                    <xsd:element name="uid" type="xsd:string"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><uid>a</uid><uid>b</uid></root>`, schema).valid).toBe(true);
            expect(check(`<root><uid>a</uid><uid>a</uid></root>`, schema).valid).toBe(false);
        });

    });

    describe("unique", () => {

        it("accepts unique values across elements", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="item" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath=".//item"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><item>a</item><item>b</item><item>c</item></root>`, schema).valid).toBe(true);
        });

        it("rejects duplicate values", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="item" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath=".//item"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const r = check(`<root><item>a</item><item>a</item></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "IDENTITY_CONSTRAINT_VIOLATION")).toBe(true);
        });

        it("excludes nodes with missing fields from the uniqueness check (empty field = not qualified)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="uuid">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="@val"/>
                        </xsd:unique>
                    </xsd:element>
                    <xsd:element name="uid">
                        <xsd:complexType>
                            <xsd:attribute name="val" type="xsd:string"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // The second uid has no val attribute — excluded from uniqueness check, so no collision
            // (XSTS idF009 semantics)
            expect(check(`<root><uid val="1"/><uid/><uid val="2"/></root>`, schema).valid).toBe(true);
            // All three have values — two collide
            expect(check(`<root><uid val="1"/><uid val="1"/></root>`, schema).valid).toBe(false);
        });

        it("rejects a field that selects more than one node", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="uuid">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="pid"/>
                        </xsd:unique>
                    </xsd:element>
                    <xsd:element name="uid">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="pid" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // Each uid has multiple pid children — field selects more than 1 node
            const r = check(`<root><uid><pid>a</pid><pid>b</pid></uid></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "IDENTITY_CONSTRAINT_VIOLATION")).toBe(true);
        });

        it("rejects a field that selects a complex element (not simple type)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="uuid">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="pid"/>
                        </xsd:unique>
                    </xsd:element>
                    <xsd:element name="uid">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="pid">
                                    <xsd:complexType>
                                        <xsd:attribute name="p" type="xsd:string"/>
                                    </xsd:complexType>
                                </xsd:element>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // pid has a complex type (element-only content) — not simple
            const r = check(`<root><uid><pid p="11"/></uid></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "IDENTITY_CONSTRAINT_VIOLATION")).toBe(true);
        });

        it("detects value-space equality for decimal types (3.0 == 3)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="uuid">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="@val"/>
                        </xsd:unique>
                    </xsd:element>
                    <xsd:element name="uid">
                        <xsd:complexType>
                            <xsd:attribute name="val" type="xsd:decimal"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // 3.0 and 3 are equal as decimal values
            expect(check(`<root><uid val="3.0"/><uid val="3"/></root>`, schema).valid).toBe(false);
            // Different values are still unique
            expect(check(`<root><uid val="3.0"/><uid val="4"/></root>`, schema).valid).toBe(true);
        });

        it("uses string equality for string types (3.0 != 3)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="uuid">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="@val"/>
                        </xsd:unique>
                    </xsd:element>
                    <xsd:element name="uid">
                        <xsd:complexType>
                            <xsd:attribute name="val" type="xsd:string"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // 3.0 and 3 are different strings
            expect(check(`<root><uid val="3.0"/><uid val="3"/></root>`, schema).valid).toBe(true);
        });

        it("default values participate in the key-sequence", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="uuid">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="@val"/>
                        </xsd:unique>
                    </xsd:element>
                    <xsd:element name="uid">
                        <xsd:complexType>
                            <xsd:attribute name="val" type="xsd:string" default="test"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // The first uid has val="test", the second gets default="test" — both produce "test" → duplicate
            expect(check(`<root><uid val="test"/><uid/></root>`, schema).valid).toBe(false);
        });

    });

    describe("key", () => {

        it("accepts unique key values", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="item" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:key name="k">
                            <xsd:selector xpath=".//item"/>
                            <xsd:field xpath="."/>
                        </xsd:key>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><item>a</item><item>b</item></root>`, schema).valid).toBe(true);
        });

        it("rejects duplicate key values", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="item" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:key name="k">
                            <xsd:selector xpath=".//item"/>
                            <xsd:field xpath="."/>
                        </xsd:key>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><item>a</item><item>a</item></root>`, schema).valid).toBe(false);
        });

        it("rejects a missing field value (key requires every field to be present)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:key name="k">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="@val"/>
                        </xsd:key>
                    </xsd:element>
                    <xsd:element name="uid">
                        <xsd:complexType>
                            <xsd:attribute name="val" type="xsd:string"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            const r = check(`<root><uid val="a"/><uid/></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "KEY_FIELD_MISSING")).toBe(true);
        });

        it("rejects a nilled element in a key field", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:key name="k">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="@val"/>
                        </xsd:key>
                    </xsd:element>
                    <xsd:element name="uid" nillable="true">
                        <xsd:complexType>
                            <xsd:attribute name="val" type="xsd:string"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // A nilled element as a field value would be a nillability issue
            // (key field selects a node that is xsi:nil). But for @val attribute,
            // the attribute is not nillable — so this would be a regular missing field error
            // if the attribute is absent. A nilled uid with no val attr → missing field.
            const r = check(`<root><uid val="a"/><uid xsi:nil="true" xmlns:xsi="${NAMESPACE_XSI}"/></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "KEY_FIELD_MISSING")).toBe(true);
        });

        it("rejects a nilled element when the field selects the element itself", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="uid" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:key name="k">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="."/>
                        </xsd:key>
                    </xsd:element>
                    <xsd:element name="uid" nillable="true" type="xsd:string"/>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // Each uid is a nilled element; the field selects the uid itself.
            // The field value is nil (element is nilled) → key violation.
            const r = check(`<root><uid xsi:nil="true" xmlns:xsi="${NAMESPACE_XSI}"/><uid xsi:nil="true" xmlns:xsi="${NAMESPACE_XSI}"/></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "KEY_FIELD_NIL")).toBe(true);
        });

    });

    describe("keyref", () => {

        it("accepts a keyref that matches a key", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="uid" type="xsd:string" maxOccurs="unbounded"/>
                                <xsd:element name="ref" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:key name="k">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="."/>
                        </xsd:key>
                        <xsd:keyref name="r" refer="k">
                            <xsd:selector xpath=".//ref"/>
                            <xsd:field xpath="."/>
                        </xsd:keyref>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // ref values "a" and "b" both match uid values "a" and "b"
            expect(check(`<root><uid>a</uid><uid>b</uid><ref>a</ref><ref>b</ref></root>`, schema).valid).toBe(true);
        });

        it("rejects a keyref that does not match any key", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="uid" type="xsd:string" maxOccurs="unbounded"/>
                                <xsd:element name="ref" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:key name="k">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="."/>
                        </xsd:key>
                        <xsd:keyref name="r" refer="k">
                            <xsd:selector xpath=".//ref"/>
                            <xsd:field xpath="."/>
                        </xsd:keyref>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // ref value "c" has no matching uid
            const r = check(`<root><uid>a</uid><uid>b</uid><ref>c</ref></root>`, schema);
            expect(r.valid).toBe(false);
            expect(r.errors.some((e) => e.code === "KEYREF_VIOLATION")).toBe(true);
        });

        it("accepts a keyref referencing a unique", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="uid" type="xsd:string" maxOccurs="unbounded"/>
                                <xsd:element name="ref" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                        <xsd:keyref name="r" refer="u">
                            <xsd:selector xpath=".//ref"/>
                            <xsd:field xpath="."/>
                        </xsd:keyref>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            expect(check(`<root><uid>a</uid><uid>b</uid><ref>a</ref><ref>b</ref></root>`, schema).valid).toBe(true);
        });

        it("rejects a keyref with a field count mismatch at compile time", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="uid" type="xsd:string" maxOccurs="unbounded"/>
                                <xsd:element name="ref" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:key name="k">
                            <xsd:selector xpath=".//uid"/>
                            <xsd:field xpath="."/>
                        </xsd:key>
                        <xsd:keyref name="r" refer="k">
                            <xsd:selector xpath=".//ref"/>
                            <xsd:field xpath="@id"/>
                            <xsd:field xpath="."/>
                        </xsd:keyref>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compile(xsd)).toThrow();
        });

    });

    describe("multi-field constraints", () => {

        it("enforces uniqueness on composite key (two fields)", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="item" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath=".//item"/>
                            <xsd:field xpath="@a"/>
                            <xsd:field xpath="@b"/>
                        </xsd:unique>
                    </xsd:element>
                    <xsd:element name="item">
                        <xsd:complexType>
                            <xsd:attribute name="a" type="xsd:string"/>
                            <xsd:attribute name="b" type="xsd:string"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `;
            const schema = compile(xsd);
            // (a=1,b=1) and (a=1,b=2) are different tuples
            expect(check(`<root><item a="1" b="1"/><item a="1" b="2"/></root>`, schema).valid).toBe(true);
            // (a=1,b=1) and (a=1,b=1) are duplicates
            expect(check(`<root><item a="1" b="1"/><item a="1" b="1"/></root>`, schema).valid).toBe(false);
        });

    });

    describe("compile-time validation", () => {

        it("rejects a keyref with an unresolvable refer", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="x" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:keyref name="r" refer="nonexistent">
                            <xsd:selector xpath=".//x"/>
                            <xsd:field xpath="."/>
                        </xsd:keyref>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compile(xsd)).toThrow();
        });

        it("rejects a keyref that refers to another keyref", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="x" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:keyref name="r1" refer="r2">
                            <xsd:selector xpath=".//x"/>
                            <xsd:field xpath="."/>
                        </xsd:keyref>
                        <xsd:keyref name="r2" refer="r1">
                            <xsd:selector xpath=".//x"/>
                            <xsd:field xpath="."/>
                        </xsd:keyref>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compile(xsd)).toThrow();
        });

        it("rejects duplicate identity constraint names", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="x" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath=".//x"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                        <xsd:key name="u">
                            <xsd:selector xpath=".//x"/>
                            <xsd:field xpath="."/>
                        </xsd:key>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compile(xsd)).toThrow();
        });

        it("rejects a selector with invalid XPath syntax", () => {
            const xsd = `
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="qualified">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="x" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="u">
                            <xsd:selector xpath="//[@illegal"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                    </xsd:element>
                </xsd:schema>
            `;
            expect(() => compile(xsd)).toThrow();
        });

    });

});
