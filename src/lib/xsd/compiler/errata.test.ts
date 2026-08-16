/**
 * Errata 1.0 sweep tests (CHK-027).
 *
 * Every schema/instance pair in the XSTS Errata10 set is exercised here with
 * derived minimal fixtures (not copies of the original XSTS data), covering
 * the spec behaviors documented in the W3C XSD 1.0 Second Edition Errata.
 *
 * See: http://www.w3.org/2004/03/xmlschema-errata
 */

import { SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { XMLParserImpl } from "@lib/xml/parser";
import { InstanceValidatorImpl } from "@lib/validator/compiled/instanceValidator";
import { CompiledSchema } from "@lib/types/component-graph";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
import { SchemaError, SchemaCompilationError } from "@lib/types/schema-error";

const compiler = new SchemaCompilerImpl(new XMLParserImpl());
const validator = new InstanceValidatorImpl(new XMLParserImpl());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compile(xsd: string, resolve?: (loc: string) => string | null): CompiledSchema {
    const errors: SchemaError[] = [];
    const result = compiler.compile(xsd, { listener: (e) => errors.push(e), resolve });
    if (errors.length > 0) {
        throw new SchemaCompilationError(errors);
    }
    return result;
}

function compileExpectingErrors(xsd: string, resolve?: (loc: string) => string | null): SchemaError[] {
    const errors: SchemaError[] = [];
    try {
        compiler.compile(xsd, { listener: (e) => errors.push(e), resolve });
    } catch (e) {
        if (!(e instanceof SchemaCompilationError)) throw e;
        // Compiler threw — errors were collected via the listener
    }
    return errors;
}

function check(xml: string, schema: CompiledSchema): { valid: boolean; errors: SchemaError[] } {
    const result = validator.validate(xml, schema);
    return { valid: result.valid, errors: result.errors };
}

// ===========================================================================
// errA001 — fractionDigits on integer-family types (E0-23)
// ===========================================================================
// Errata: fractionDigits can be added to all numeric datatypes as long as
// value is 0 (except decimal which takes any value).

describe("errA001 — fractionDigits on integer types (E0-23)", () => {

    const schemaXSD = (fd: string) => `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t">
            <xsd:simpleType name="myByte">
                <xsd:restriction base="xsd:byte">
                    <xsd:fractionDigits value="${fd}"/>
                </xsd:restriction>
            </xsd:simpleType>
            <xsd:simpleType name="myDecimal">
                <xsd:restriction base="xsd:decimal">
                    <xsd:fractionDigits value="${fd}"/>
                </xsd:restriction>
            </xsd:simpleType>
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:choice maxOccurs="unbounded">
                        <xsd:element name="b" type="tns:myByte"/>
                        <xsd:element name="d" type="tns:myDecimal"/>
                    </xsd:choice>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;

    it("accepts fractionDigits=0 on integer subtypes", () => {
        expect(() => compile(schemaXSD("0"))).not.toThrow();
    });

    it("accepts fractionDigits=5 on decimal", () => {
        expect(() => compile(schemaXSD("5"))).not.toThrow();
    });

    it("validates instance with decimal fractionDigits=5", () => {
        const s = compile(schemaXSD("5"));
        const r = check('<t:root xmlns:t="urn:t"><d>123.45678</d></t:root>', s);
        expect(r.valid).toBe(true);
    });

    it("rejects instance exceeding fractionDigits=5", () => {
        const s = compile(schemaXSD("5"));
        const r = check('<t:root xmlns:t="urn:t"><d>123.123456</d></t:root>', s);
        expect(r.valid).toBe(false);
        expect(r.errors.some((e) => e.code === "FACET_VIOLATION")).toBe(true);
    });
});

// ===========================================================================
// errA002 — ##other excludes absent namespace (E0-10, E1-11)
// ===========================================================================
// Errata: ##other is any namespace other than the target namespace; the
// absent (no) namespace is not included.

describe("errA002 — ##other excludes absent namespace (E0-10, E1-11)", () => {

    const S = `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}">
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:any namespace="##other" processContents="lax"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;

    it("accepts schema with ##other wildcard", () => {
        expect(() => compile(S)).not.toThrow();
    });

    it("matches a qualified element from another namespace", () => {
        const s = compile(S);
        const r = check('<t:root xmlns:t="urn:t" xmlns:o="urn:other"><o:el>text</o:el></t:root>', s);
        expect(r.valid).toBe(true);
    });

    it("does not match an element with no namespace", () => {
        const s = compile(S);
        const r = check('<t:root xmlns:t="urn:t"><noNSEl>true</noNSEl></t:root>', s);
        expect(r.valid).toBe(false);
        expect(r.errors.some((e) => e.code === "UNEXPECTED_ELEMENT")).toBe(true);
    });
});

// ===========================================================================
// errA003 — gMonth lexical (--05)
// ===========================================================================
// Errata: gMonth lexical form is --MM[--] with optional timezone (E2-22).

describe("errA003 — gMonth lexical (--05)", () => {
    const S = `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t">
            <xsd:complexType name="rt">
                <xsd:all>
                    <xsd:element ref="tns:g"/>
                </xsd:all>
            </xsd:complexType>
            <xsd:element name="root" type="tns:rt"/>
            <xsd:element name="g" type="xsd:gMonth"/>
        </xsd:schema>
    `;

    it("accepts --05", () => {
        const s = compile(S);
        const r = check('<t:root xmlns:t="urn:t"><t:g>--05</t:g></t:root>', s);
        expect(r.valid).toBe(true);
    });
});

// ===========================================================================
// errC001 — anySimpleType whiteSpace = preserve (E1-40)
// ===========================================================================
// Errata: anySimpleType's whiteSpace facet is set to "preserve".

describe("errC001 — anySimpleType whiteSpace preserve (E1-40)", () => {
    const S = (fixed: string) => `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}">
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:attribute name="a" type="xsd:anySimpleType" fixed="${fixed}"/>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;

    it("accepts anySimpleType attr with fixed value", () => {
        const s = compile(S("Hello World"));
        const r = check('<t:root xmlns:t="urn:t" a="Hello World"/>', s);
        expect(r.valid).toBe(true);
    });

    it("accepts anySimpleType attr with leading/trailing/internal spaces", () => {
        const s = compile(S("This   is   a   fixed value"));
        const r = check('<t:root xmlns:t="urn:t" a="This   is   a   fixed value"/>', s);
        expect(r.valid).toBe(true);
    });
});

// ===========================================================================
// errC002 — schema version attribute is normalizedString (E1-9)
// ===========================================================================
// Errata: the version attribute of xs:schema is of type normalizedString,
// not token, so leading/trailing/multiple internal spaces are allowed.

describe("errC002 — version normalizedString (E1-9)", () => {
    it("accepts schema with spaced version attribute", () => {
        const S = `
            <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}"
                version="  This  is not a token  ">
                <xsd:element name="root"/>
            </xsd:schema>
        `;
        expect(() => compile(S)).not.toThrow();
    });
});

// ===========================================================================
// errC003 — model group definition with id, foreign attrs, occurrences (E1-3)
// ===========================================================================
// Errata: model group definitions accept id, foreign-namespace attributes,
// and group ref particles accept minOccurs/maxOccurs.

describe("errC003 — model group definition (E1-3)", () => {
    it("accepts group with id, xmlns, and group ref with occurrences", () => {
        const S = `
            <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t"
                xmlns:ext="urn:ext">
                <xsd:group name="g" id="id1" ext:attr="val">
                    <xsd:sequence>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:group>
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:group ref="tns:g" minOccurs="2" maxOccurs="20"/>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;
        expect(() => compile(S)).not.toThrow();
    });
});

// ===========================================================================
// errC004 — notation public attribute is optional, type token (E1-16)
// ===========================================================================
// Errata: notation's public attribute is optional and its value space is token.

describe("errC004 — notation public optional + token (E1-16)", () => {
    it("accepts notation with public value containing spaces (token)", () => {
        const S = `
            <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:notation name="n1" public="This is a token now"/>
                <xsd:notation name="n2" system="http://uri"/>
                <xsd:element name="root" type="xsd:anyType"/>
            </xsd:schema>
        `;
        expect(() => compile(S)).not.toThrow();
    });
});

// ===========================================================================
// errC005 — local element must not have abstract attribute (E1-13)
// ===========================================================================
// Errata: local element declarations must not carry the abstract attribute
// (S4S localElement: abstract use="prohibited").

describe("errC005 — local element abstract=false invalid (E1-13)", () => {
    it("rejects local element with abstract='false'", () => {
        const code = `
            <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="local" type="xsd:string" abstract="false"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;
        const errors = compileExpectingErrors(code);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
    });
});

// ===========================================================================
// errC006 — local element must not have abstract attribute true (E1-13)
// ===========================================================================
describe("errC006 — local element abstract=true invalid (E1-13)", () => {
    it("rejects local element with abstract='true'", () => {
        const code = `
            <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="local" type="xsd:string" abstract="true"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;
        const errors = compileExpectingErrors(code);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
    });
});

// ===========================================================================
// errC007 — anyType processContents = lax (E1-22 / R-117)
// ===========================================================================
// Errata: the ur-type's particle is a ##any wildcard with processContents=lax.

describe("errC007 — anyType lax processContents (E1-22 / R-117)", () => {
    const S = `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t">
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="el1"/>
                        <xsd:element name="el2" type="xsd:anyType"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
            <xsd:element name="declared" type="xsd:short"/>
            <xsd:attribute name="attr" type="xsd:boolean"/>
        </xsd:schema>
    `;

    it("accepts undeclared child inside anyType element", () => {
        const s = compile(S);
        // el1 and el2 are local → unqualified; declared is tns-qualified.
        const r = check(`<t:root xmlns:t="urn:t">
            <el1><t:declared>123</t:declared></el1>
            <el2><unknown>text</unknown><t:declared>456</t:declared></el2>
        </t:root>`, s);
        expect(r.valid).toBe(true);
    });

    it("accepts undeclared attribute on anyType element", () => {
        const s = compile(S);
        const r = check(`<t:root xmlns:t="urn:t">
            <el1 x="y"/>
            <el2 t:attr="true">text</el2>
        </t:root>`, s);
        expect(r.valid).toBe(true);
    });
});

// ===========================================================================
// errC008 — wildcard restriction processContents ordering (E1-21)
// ===========================================================================
// Errata: processContents of restriction must be identical or stronger
// (strict > lax > skip).

describe("errC008 — wildcard restriction strict→lax invalid (E1-21)", () => {
    it("rejects xs:any restriction from strict to lax", () => {
        const code = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="base">
                    <xsd:sequence>
                        <xsd:any processContents="strict"/>
                    </xsd:sequence>
                </xsd:complexType>
                <xsd:complexType name="derived">
                    <xsd:complexContent>
                        <xsd:restriction base="base">
                            <xsd:sequence>
                                <xsd:any processContents="lax"/>
                            </xsd:sequence>
                        </xsd:restriction>
                    </xsd:complexContent>
                </xsd:complexType>
                <xsd:element name="doc" type="derived"/>
            </xsd:schema>
        `;
        const errors = compileExpectingErrors(code);
        expect(errors.some((e) => e.code === "INVALID_RESTRICTION")).toBe(true);
    });
});

// ===========================================================================
// errC009 — anyAttribute restriction processContents ordering (E1-21)
// ===========================================================================
describe("errC009 — anyAttribute restriction strict→skip invalid (E1-21)", () => {
    it("rejects xs:anyAttribute restriction from strict to skip", () => {
        const code = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="base">
                    <xsd:sequence>
                        <xsd:element name="foo"/>
                    </xsd:sequence>
                    <xsd:anyAttribute processContents="strict"/>
                </xsd:complexType>
                <xsd:complexType name="derived">
                    <xsd:complexContent>
                        <xsd:restriction base="base">
                            <xsd:sequence>
                                <xsd:element name="foo"/>
                            </xsd:sequence>
                            <xsd:anyAttribute processContents="skip"/>
                        </xsd:restriction>
                    </xsd:complexContent>
                </xsd:complexType>
                <xsd:element name="doc" type="derived"/>
            </xsd:schema>
        `;
        const errors = compileExpectingErrors(code);
        expect(errors.some((e) => e.code === "INVALID_RESTRICTION")).toBe(true);
    });
});

// ===========================================================================
// errE001 — nonPositiveInteger supports +0 (E2-27)
// ===========================================================================
describe("errE001 — +0 for nonPositiveInteger (E2-27)", () => {
    const S = `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t">
            <xsd:element name="e" type="xsd:nonPositiveInteger"/>
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:all>
                        <xsd:element ref="tns:e"/>
                    </xsd:all>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;
    it("accepts +0", () => {
        const s = compile(S);
        const r = check('<t:root xmlns:t="urn:t"><t:e>+0</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });
});

// ===========================================================================
// errE002 — nonNegativeInteger supports -0 (E2-27)
// ===========================================================================
describe("errE002 — -0 for nonNegativeInteger (E2-27)", () => {
    const S = `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t">
            <xsd:element name="e" type="xsd:nonNegativeInteger"/>
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:all>
                        <xsd:element ref="tns:e"/>
                    </xsd:all>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;
    it("accepts -0", () => {
        const s = compile(S);
        const r = check('<t:root xmlns:t="urn:t"><t:e>-0</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });
});

// ===========================================================================
// errE003 — language pattern updated (E2-25)
// ===========================================================================
// Errata: language pattern is [a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*
// (RFC 3066, multiple subtags allowed).

describe("errE003 — language pattern (E2-25)", () => {
    const S = `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t">
            <xsd:element name="e" type="xsd:language"/>
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:all>
                        <xsd:element ref="tns:e"/>
                    </xsd:all>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;
    it("accepts multi-subtag language", () => {
        const s = compile(S);
        const r = check('<t:root xmlns:t="urn:t"><t:e>ABCDEFGH-abCD42ef</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });
});

// ===========================================================================
// errE004 — duration T absent when no time components (E2-24)
// ===========================================================================
// Errata: the 'T' must be absent from a duration when no time components
// (hours, minutes, seconds) are present.

describe("errE004 — duration T with no time components invalid (E2-24)", () => {
    const S = `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t">
            <xsd:element name="e" type="xsd:duration"/>
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:all>
                        <xsd:element ref="tns:e"/>
                    </xsd:all>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;

    it("rejects P20Y0M15DT (T with no time components)", () => {
        const s = compile(S);
        const r = check('<t:root xmlns:t="urn:t"><t:e>P20Y0M15DT</t:e></t:root>', s);
        expect(r.valid).toBe(false);
        expect(r.errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
    });

    it("accepts P20Y0M15D (no T)", () => {
        const s = compile(S);
        const r = check('<t:root xmlns:t="urn:t"><t:e>P20Y0M15D</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });
});

// ===========================================================================
// errE006 — date/gYear types permit optional trailing timezone (E2-22)
// ===========================================================================
// Errata: date, gYearMonth, gMonthDay, gDay, gMonth, gYear all permit an
// optional trailing timezone specification.

describe("errE006 — timezone on date/gYear types (E2-22)", () => {
    const S = (type: string, name: string) => `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t">
            <xsd:element name="e" type="xsd:${type}"/>
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element ref="tns:e" minOccurs="2" maxOccurs="2"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;

    it("accepts date with -05:00 and Z timezone", () => {
        const s = compile(S("date", "e"));
        const r = check('<t:root xmlns:t="urn:t"><t:e>2002-12-31-05:00</t:e><t:e>2002-12-31Z</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });

    it("accepts gYearMonth with -05:00 and Z", () => {
        const s = compile(S("gYearMonth", "e"));
        const r = check('<t:root xmlns:t="urn:t"><t:e>2002-12-05:00</t:e><t:e>2002-12Z</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });

    it("accepts gMonthDay with -05:00 and Z", () => {
        const s = compile(S("gMonthDay", "e"));
        const r = check('<t:root xmlns:t="urn:t"><t:e>--12-31-05:00</t:e><t:e>--12-31Z</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });

    it("accepts gDay with -05:00 and Z", () => {
        const s = compile(S("gDay", "e"));
        const r = check('<t:root xmlns:t="urn:t"><t:e>---31-05:00</t:e><t:e>---31Z</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });

    it("accepts gMonth with --Z and ---05:00", () => {
        const s = compile(S("gMonth", "e"));
        const r = check('<t:root xmlns:t="urn:t"><t:e>--12--Z</t:e><t:e>--12---05:00</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });

    it("accepts gYear with -05:00 and Z", () => {
        const s = compile(S("gYear", "e"));
        const r = check('<t:root xmlns:t="urn:t"><t:e>2002-05:00</t:e><t:e>2002Z</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });
});

// ===========================================================================
// errE008 — token value/lexical space no longer supports CR (E2-17)
// ===========================================================================
// Errata: token's whiteSpace=collapse normalizes CR (0xD) to space, so
// a value containing CR after normalization is a valid token.

describe("errE008 — token with CR (E2-17)", () => {
    const S = `
        <xsd:schema targetNamespace="urn:t" xmlns:xsd="${NAMESPACE_XSD}" xmlns:tns="urn:t">
            <xsd:element name="e" type="xsd:token"/>
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element ref="tns:e"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;
    it("accepts token with carriage return (collapse normalizes to space)", () => {
        const s = compile(S);
        // CR (0x0D) in element content: collapse turns it into space, then
        // the value "test data" is a valid token.
        const r = check('<t:root xmlns:t="urn:t"><t:e>test\rdata</t:e></t:root>', s);
        expect(r.valid).toBe(true);
    });
});

// ===========================================================================
// errF001 — length allowed with minLength/maxLength in different steps (E2-35)
// ===========================================================================
// Errata: length facet may coexist with minLength or maxLength as long as
// they are specified in different derivation steps.

describe("errF001 — length+maxLength in different derivation steps (E2-35)", () => {
    const S = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
            <xsd:simpleType name="st">
                <xsd:restriction base="xsd:string">
                    <xsd:length value="5"/>
                </xsd:restriction>
            </xsd:simpleType>
            <xsd:simpleType name="st2">
                <xsd:restriction base="st">
                    <xsd:maxLength value="5"/>
                </xsd:restriction>
            </xsd:simpleType>
            <xsd:element name="doc">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="f1" type="st"/>
                        <xsd:element name="f2" type="st2"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;

    it("accepts schema with length+maxLength in different derivation steps", () => {
        expect(() => compile(S)).not.toThrow();
    });

    it("rejects instance violating inherited length facet", () => {
        const s = compile(S);
        const r = check('<doc><f1>abcde</f1><f2>abcd</f2></doc>', s);
        expect(r.valid).toBe(false);
        expect(r.errors.some((e) => e.code === "FACET_VIOLATION")).toBe(true);
    });
});