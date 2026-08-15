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

});
