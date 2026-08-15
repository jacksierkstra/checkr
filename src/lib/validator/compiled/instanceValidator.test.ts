import { XMLParserImpl } from "@lib/xml/parser";
import { SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { InstanceValidatorImpl } from "@lib/validator/compiled/instanceValidator";
import { CompiledSchema } from "@lib/types/component-graph";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
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

        it("reports choice content models as unsupported rather than guessing", () => {
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
            const { valid, errors } = check(`<root><a>x</a></root>`, schema);
            expect(valid).toBe(false);
            expect(errors.some((e) => e.code === "UNSUPPORTED_FEATURE")).toBe(true);
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
            const xml = `<root id="a" code="b" xmlns:q="urn:q" xml:lang="en" xmlns:xsi="${NAMESPACE_XSD.replace("Schema", "Schema-instance")}" xsi:nil="true"/>`;
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

});
