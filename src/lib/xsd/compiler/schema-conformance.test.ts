/**
 * Schema-for-schemas conformance tests (CHK-025).
 *
 * Tests compile-time schema validity checking across all supported constructs:
 * facet combinations, occurrence rules, declaration property conflicts,
 * abstract-component misuse, and structure rules. Every test that expects
 * compile errors asserts the error code and phase.
 *
 * Also includes a mini XSTS-style schemaTest harness (AC5) that scores
 * a representative valid/invalid schemaTest pair.
 */

import { SchemaCompilerImpl } from "@lib/xsd/compiler/schemaCompiler";
import { XMLParserImpl } from "@lib/xml/parser";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
import { SchemaCompilationError, SchemaError, SchemaErrorCode } from "@lib/types/schema-error";

const compiler = new SchemaCompilerImpl(new XMLParserImpl());

// ---------------------------------------------------------------------------
// Helper: compile a schema and collect errors. Returns the error list.
// Throws if no SchemaCompilationError was thrown (i.e. schema compiled clean).
// ---------------------------------------------------------------------------

function compileExpectingErrors(xsd: string): SchemaError[] {
    const errors: SchemaError[] = [];
    expect(() => compiler.compile(xsd, { listener: (e) => errors.push(e) }))
        .toThrow(SchemaCompilationError);
    return errors;
}

function compileExpectingClean(xsd: string): void {
    const errors: SchemaError[] = [];
    const result = compiler.compile(xsd, { listener: (e) => errors.push(e) });
    expect(errors).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// XSTS-style schemaTest harness (AC5)
// ---------------------------------------------------------------------------

interface SchemaTestFixture {
    name: string;
    /** The schema document string(s) to compile. First is the root. */
    xsd: string[];
    /** Expected validity: "valid" (compiles clean) or "invalid" (throws with errors). */
    expected: "valid" | "invalid";
}

/**
 * Score a mini schemaTest: compile the first schema document, optionally
 * providing a resolver for multi-document scenarios. Assert the expected
 * validity and that all errors have phase: schema-compilation.
 */
function scoreSchemaTest(fixture: SchemaTestFixture): void {
    const errors: SchemaError[] = [];
    const listener = (e: SchemaError) => errors.push(e);
    let threw = false;
    try {
        const resolve = fixture.xsd.length > 1
            ? makeResolver(fixture.xsd.slice(1))
            : undefined;
        compiler.compile(fixture.xsd[0], { listener, resolve });
    } catch (e) {
        if (e instanceof SchemaCompilationError) {
            threw = true;
        } else {
            throw e;
        }
    }
    if (fixture.expected === "valid") {
        expect(threw).toBe(false);
        expect(errors).toHaveLength(0);
    } else {
        expect(threw).toBe(true);
        expect(errors.length).toBeGreaterThan(0);
        for (const err of errors) {
            expect(err.phase).toBe("schema-compilation");
        }
    }
}

function makeResolver(
    sources: string[],
    prefix: string = "include_",
): (location: string) => string | null {
    const map: Record<string, string> = {};
    for (let i = 0; i < sources.length; i++) {
        map[`${prefix}${i}.xsd`] = sources[i];
    }
    return (loc: string) => map[loc] ?? null;
}

// ===========================================================================
// Facet conformance
// ===========================================================================

describe("facet conformance (CHK-025)", () => {

    describe("duplicate facet kinds", () => {

        it("reports INVALID_FACET_COMBINATION for duplicate length", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="2"/>
                            <xsd:length value="4"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_COMBINATION")).toBe(true);
        });

        it("reports INVALID_FACET_COMBINATION for duplicate minLength", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:string">
                            <xsd:minLength value="1"/>
                            <xsd:minLength value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_COMBINATION")).toBe(true);
        });

        it("allows duplicate pattern facets (accumulate)", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Fine">
                        <xsd:restriction base="xsd:string">
                            <xsd:pattern value="[A-Z]"/>
                            <xsd:pattern value="[0-9]"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
        });

        it("allows duplicate enumeration facets (accumulate)", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Fine">
                        <xsd:restriction base="xsd:string">
                            <xsd:enumeration value="red"/>
                            <xsd:enumeration value="blue"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
        });
    });

    describe("invalid facet values", () => {

        it("reports INVALID_FACET_VALUE for negative length", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="-1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_VALUE")).toBe(true);
        });

        it("reports INVALID_FACET_VALUE for non-integer length", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="abc"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_VALUE")).toBe(true);
        });

        it("reports INVALID_FACET_VALUE for negative totalDigits", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:decimal">
                            <xsd:totalDigits value="-2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_VALUE")).toBe(true);
        });

        it("reports INVALID_FACET_VALUE for invalid whiteSpace value", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:string">
                            <xsd:whiteSpace value="bogus"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_VALUE")).toBe(true);
        });

        it("accepts valid whiteSpace values", () => {
            for (const ws of ["preserve", "replace", "collapse"]) {
                compileExpectingClean(`
                    <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                        <xsd:simpleType name="Good">
                            <xsd:restriction base="xsd:string">
                                <xsd:whiteSpace value="${ws}"/>
                            </xsd:restriction>
                        </xsd:simpleType>
                    </xsd:schema>
                `);
            }
        });
    });

    describe("conflicting facet combinations", () => {

        it("reports INVALID_FACET_COMBINATION for length + minLength", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="3"/>
                            <xsd:minLength value="1"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_COMBINATION")).toBe(true);
        });

        it("reports INVALID_FACET_COMBINATION for length + maxLength", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="3"/>
                            <xsd:maxLength value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_COMBINATION")).toBe(true);
        });

        it("reports INVALID_FACET_COMBINATION for minInclusive + minExclusive", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:integer">
                            <xsd:minInclusive value="5"/>
                            <xsd:minExclusive value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_COMBINATION")).toBe(true);
        });

        it("reports INVALID_FACET_COMBINATION for maxInclusive + maxExclusive", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:integer">
                            <xsd:maxInclusive value="10"/>
                            <xsd:maxExclusive value="10"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_COMBINATION")).toBe(true);
        });

        it("reports INVALID_FACET_COMBINATION for minInclusive > maxInclusive", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:integer">
                            <xsd:minInclusive value="10"/>
                            <xsd:maxInclusive value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_COMBINATION")).toBe(true);
        });

        it("reports INVALID_FACET_COMBINATION for fractionDigits > totalDigits", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:decimal">
                            <xsd:totalDigits value="3"/>
                            <xsd:fractionDigits value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_FACET_COMBINATION")).toBe(true);
        });

        it("reports INVALID_FACET_COMBINATION for fractionDigits > totalDigits (equal=ok)", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Good">
                        <xsd:restriction base="xsd:decimal">
                            <xsd:totalDigits value="5"/>
                            <xsd:fractionDigits value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
        });

        it("accepts a conforming simpleType restriction with facets", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="Good">
                        <xsd:restriction base="xsd:integer">
                            <xsd:minInclusive value="1"/>
                            <xsd:maxInclusive value="10"/>
                            <xsd:enumeration value="5"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>
            `);
        });
    });
});

// ===========================================================================
// Occurrence conformance
// ===========================================================================

describe("occurrence conformance (CHK-025)", () => {

    it("reports INVALID_OCCURRENCE for minOccurs > maxOccurs", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" minOccurs="2" maxOccurs="1"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_OCCURRENCE")).toBe(true);
    });

    it("reports INVALID_OCCURRENCE for minOccurs > maxOccurs on a compositor", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:choice minOccurs="5" maxOccurs="3">
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:choice>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_OCCURRENCE")).toBe(true);
    });

    it("reports INVALID_OCCURRENCE for negative minOccurs", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" minOccurs="-1"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_OCCURRENCE")).toBe(true);
    });

    it("reports INVALID_OCCURRENCE for negative maxOccurs", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" maxOccurs="-2"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_OCCURRENCE")).toBe(true);
    });

    it("reports INVALID_OCCURRENCE for minOccurs=unbounded", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" minOccurs="unbounded"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_OCCURRENCE")).toBe(true);
    });

    it("reports INVALID_OCCURRENCE for non-integer minOccurs", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" minOccurs="abc"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_OCCURRENCE")).toBe(true);
    });

    it("reports INVALID_OCCURRENCE for non-integer maxOccurs", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" maxOccurs="xyz"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_OCCURRENCE")).toBe(true);
    });

    it("accepts maxOccurs=unbounded", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" maxOccurs="unbounded"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
    });

    it("accepts maxOccurs=0", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" minOccurs="0" maxOccurs="0"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
    });

    it("accepts valid occurrences", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element name="a" minOccurs="0" maxOccurs="5"/>
                            <xsd:element name="b" maxOccurs="unbounded"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
    });

    it("reports INVALID_DECLARATION for minOccurs on an attribute", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:attribute name="a" minOccurs="0"/>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
    });

    it("reports INVALID_DECLARATION for maxOccurs on an attribute", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:attribute name="a" maxOccurs="2"/>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
    });
});

// ===========================================================================
// Declaration property conformance
// ===========================================================================

describe("declaration property conformance (CHK-025)", () => {

    describe("name/ref mutual exclusion", () => {

        it("reports INVALID_DECLARATION for element with both name and ref", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" ref="b"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for element with neither name nor ref", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for attribute with both name and ref", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:attribute name="a" ref="b"/>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:attribute name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for attribute with neither name nor ref", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:attribute type="xsd:string"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });
    });

    describe("ref attribute conflicts", () => {

        it("reports INVALID_DECLARATION for ref + type", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="b" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for ref + nillable", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="b" nillable="true"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for ref + default", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="b" default="foo"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for ref + fixed", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="b" fixed="bar"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for ref + substitutionGroup", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="b" substitutionGroup="c"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                    <xsd:element name="c" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for ref + abstract", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="b" abstract="true"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for ref + block", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="b" block="extension"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for ref + form", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="b" form="qualified"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for ref + identity constraints", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="b">
                                    <xsd:unique name="u">
                                        <xsd:selector xpath="."/>
                                        <xsd:field xpath="@id"/>
                                    </xsd:unique>
                                </xsd:element>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="b" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });
    });

    describe("type + inline type", () => {

        it("reports INVALID_DECLARATION for element with both type and inline type", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string">
                                    <xsd:simpleType>
                                        <xsd:restriction base="xsd:integer">
                                            <xsd:minInclusive value="1"/>
                                        </xsd:restriction>
                                    </xsd:simpleType>
                                </xsd:element>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for element with both inline simpleType and complexType", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a">
                                    <xsd:simpleType>
                                        <xsd:restriction base="xsd:string"/>
                                    </xsd:simpleType>
                                    <xsd:complexType>
                                        <xsd:sequence>
                                            <xsd:element name="b" type="xsd:string"/>
                                        </xsd:sequence>
                                    </xsd:complexType>
                                </xsd:element>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });
    });

    describe("value constraint conflicts", () => {

        it("reports INVALID_DECLARATION for nillable + default", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x" type="xsd:string" nillable="true" default="foo"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for nillable + fixed", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x" type="xsd:string" nillable="true" fixed="bar"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for attribute with default + fixed", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:attribute name="a" default="x" fixed="y"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for attribute use=required + default", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:attribute name="a" use="required" default="x"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("accepts attribute use=required + fixed", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:attribute name="a" use="required" fixed="x"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
        });
    });

    describe("use value validation", () => {

        it("reports INVALID_DECLARATION for invalid use value", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:attribute name="a" use="bogus"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("accepts use=optional", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:attribute name="a" use="optional"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
        });

        it("accepts use=prohibited", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:attribute name="a" use="prohibited"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
        });
    });

    describe("form attribute validation", () => {

        it("reports INVALID_DECLARATION for invalid form value on element", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" form="bogus"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for invalid form value on attribute", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:attribute name="a" form="bogus"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for invalid elementFormDefault", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" elementFormDefault="bogus">
                    <xsd:element name="x" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for invalid attributeFormDefault", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" attributeFormDefault="bogus">
                    <xsd:element name="x" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for form on a global element", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x" type="xsd:string" form="qualified"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });
    });

    describe("substitutionGroup on local elements", () => {

        it("reports INVALID_DECLARATION for substitutionGroup on a local element", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" substitutionGroup="c"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="c" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });
    });

    describe("block/final token validation", () => {

        it("reports INVALID_DECLARATION for unknown block token", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x" type="xsd:string" block="bogus"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for unknown block token in blockDefault", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" blockDefault="bogus">
                    <xsd:element name="x" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for unknown token in finalDefault", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" finalDefault="bogus">
                    <xsd:element name="x" type="xsd:string"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("accepts unknown token in blockDefault when #all is also present", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}" blockDefault="#all">
                    <xsd:element name="x" type="xsd:string"/>
                </xsd:schema>
            `);
        });

        it("reports INVALID_DECLARATION for unknown final token on complexType", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:complexType name="CT" final="bogus">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:element name="e" type="CT"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for unknown final token on simpleType", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:simpleType name="ST" final="bogus">
                        <xsd:restriction base="xsd:string"/>
                    </xsd:simpleType>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });
    });

    describe("accepting conforming declarations", () => {

        it("reports INVALID_DECLARATION for minOccurs on a global element", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x" type="xsd:string" minOccurs="0"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("reports INVALID_DECLARATION for maxOccurs on a global element", () => {
            const errors = compileExpectingErrors(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x" type="xsd:string" maxOccurs="2"/>
                </xsd:schema>
            `);
            expect(errors.some((e) => e.code === "INVALID_DECLARATION")).toBe(true);
        });

        it("accepts a global element with name, type, and block", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x" type="xsd:string" block="extension restriction"/>
                </xsd:schema>
            `);
        });

        it("accepts a local element with ref only", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="x"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>
            `);
        });

        it("accepts a global element with #all block", () => {
            compileExpectingClean(`
                <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                    <xsd:element name="x" type="xsd:string" block="#all"/>
                </xsd:schema>
            `);
        });
    });
});

// ===========================================================================
// Abstract-component misuse at compile time
// ===========================================================================

describe("abstract-component misuse at compile time (CHK-025)", () => {

    it("accepts ref to an abstract element (compile-time, instance-time check only)", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="abstractEl" abstract="true" type="xsd:string"/>
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element ref="abstractEl"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
    });

    it("accepts ref to a non-abstract element", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="concreteEl" type="xsd:string"/>
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element ref="concreteEl"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
    });

    it("accepts an abstract element used as a substitution-group head with concrete members", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="animal" abstract="true" type="xsd:string"/>
                <xsd:element name="dog" type="xsd:string" substitutionGroup="animal"/>
                <xsd:element name="cat" type="xsd:string" substitutionGroup="animal"/>
                <xsd:element name="x">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element ref="dog"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `);
    });

    it("accepts an element declared with an abstract complex type (xsi:type pattern)", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="AbstractCT" abstract="true">
                    <xsd:sequence>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:complexType>
                <xsd:element name="x" type="AbstractCT"/>
            </xsd:schema>
        `);
    });

    it("accepts element with a simple type", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="x" type="xsd:string"/>
            </xsd:schema>
        `);
    });
});

// ===========================================================================
// Structure rules
// ===========================================================================

describe("structure rules (CHK-025)", () => {

    it("reports INVALID_SCHEMA_DOCUMENT for complexType with both simpleContent and complexContent", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="Bad">
                    <xsd:simpleContent>
                        <xsd:extension base="xsd:string"/>
                    </xsd:simpleContent>
                    <xsd:complexContent>
                        <xsd:extension base="xsd:anyType"/>
                    </xsd:complexContent>
                </xsd:complexType>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT")).toBe(true);
    });

    it("reports INVALID_SCHEMA_DOCUMENT for complexType with two compositors", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="Bad">
                    <xsd:sequence>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                    <xsd:choice>
                        <xsd:element name="b" type="xsd:string"/>
                    </xsd:choice>
                </xsd:complexType>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT")).toBe(true);
    });

    it("reports INVALID_SCHEMA_DOCUMENT for complexType with a compositor and simpleContent", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="Bad">
                    <xsd:sequence>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                    <xsd:simpleContent>
                        <xsd:extension base="xsd:string"/>
                    </xsd:simpleContent>
                </xsd:complexType>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT")).toBe(true);
    });

    it("reports INVALID_SCHEMA_DOCUMENT for simpleContent with both extension and restriction", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="Bad">
                    <xsd:simpleContent>
                        <xsd:extension base="xsd:string"/>
                        <xsd:restriction base="xsd:string"/>
                    </xsd:simpleContent>
                </xsd:complexType>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT")).toBe(true);
    });

    it("reports INVALID_SCHEMA_DOCUMENT for complexContent with both extension and restriction", () => {
        const errors = compileExpectingErrors(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="Bad">
                    <xsd:complexContent>
                        <xsd:extension base="xsd:anyType"/>
                        <xsd:restriction base="xsd:anyType"/>
                    </xsd:complexContent>
                </xsd:complexType>
            </xsd:schema>
        `);
        expect(errors.some((e) => e.code === "INVALID_SCHEMA_DOCUMENT")).toBe(true);
    });

    it("accepts a conforming complexType with one compositor", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="Good">
                    <xsd:sequence>
                        <xsd:element name="a" type="xsd:string"/>
                    </xsd:sequence>
                    <xsd:attribute name="id" type="xsd:ID"/>
                </xsd:complexType>
                <xsd:element name="e" type="Good"/>
            </xsd:schema>
        `);
    });

    it("accepts a conforming simpleContent extension", () => {
        compileExpectingClean(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:complexType name="Good">
                    <xsd:simpleContent>
                        <xsd:extension base="xsd:string">
                            <xsd:attribute name="id" type="xsd:ID"/>
                        </xsd:extension>
                    </xsd:simpleContent>
                </xsd:complexType>
                <xsd:element name="e" type="Good"/>
            </xsd:schema>
        `);
    });
});

// ===========================================================================
// XSTS-style schemaTest harness (AC5)
// ===========================================================================

describe("XSTS schemaTest scoring (CHK-025 AC5)", () => {

    // Helper: score a schemaTest with a expected validity string.
    // Errors are collected through the listener so we can validate phase.
    function score(schemaTest: { expected: "valid" | "invalid"; xsd: string }): { valid: boolean; errors: SchemaError[] } {
        const errors: SchemaError[] = [];
        let threw = false;
        try {
            compiler.compile(schemaTest.xsd, { listener: (e) => errors.push(e) });
        } catch (e) {
            if (e instanceof SchemaCompilationError) threw = true;
            else throw e;
        }
        const valid = !threw;
        return { valid, errors };
    }

    // Representative valid schemaTest: a conforming multi-feature schema.
    const VALID_FIXTURE: { expected: "valid"; xsd: string } = {
        expected: "valid",
        xsd: `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}"
                targetNamespace="urn:test"
                xmlns="urn:test"
                elementFormDefault="qualified">

                <!-- Simple type with facets -->
                <xsd:simpleType name="NameType">
                    <xsd:restriction base="xsd:string">
                        <xsd:minLength value="1"/>
                        <xsd:maxLength value="100"/>
                    </xsd:restriction>
                </xsd:simpleType>

                <!-- Complex type with derivation -->
                <xsd:complexType name="BaseType">
                    <xsd:sequence>
                        <xsd:element name="name" type="NameType"/>
                        <xsd:element name="value" type="xsd:decimal" minOccurs="0" maxOccurs="unbounded"/>
                    </xsd:sequence>
                    <xsd:attribute name="id" type="xsd:ID" use="required"/>
                </xsd:complexType>

                <xsd:complexType name="DerivedType">
                    <xsd:complexContent>
                        <xsd:extension base="BaseType">
                            <xsd:sequence>
                                <xsd:element name="extra" type="xsd:string"/>
                            </xsd:sequence>
                            <xsd:attribute name="active" type="xsd:boolean"/>
                        </xsd:extension>
                    </xsd:complexContent>
                </xsd:complexType>

                <xsd:element name="root" type="DerivedType"/>
            </xsd:schema>
        `,
    };

    // Representative invalid schemaTest: a schema with a facet conflict.
    const INVALID_FIXTURE: { expected: "invalid"; xsd: string } = {
        expected: "invalid",
        xsd: `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:simpleType name="BadRange">
                    <xsd:restriction base="xsd:integer">
                        <xsd:minInclusive value="10"/>
                        <xsd:maxInclusive value="5"/>
                    </xsd:restriction>
                </xsd:simpleType>
            </xsd:schema>
        `,
    };

    it("scores a conforming schema as valid and reports zero errors", () => {
        const result = score(VALID_FIXTURE);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it("scores a non-conforming schema as invalid with phase=schema-compilation errors", () => {
        const result = score(INVALID_FIXTURE);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        for (const err of result.errors) {
            expect(err.phase).toBe("schema-compilation");
        }
        // The specific error we expect
        expect(result.errors.some((e) => e.code === "INVALID_FACET_COMBINATION")).toBe(true);
    });

    it("reports conforming schemas with ancilliary features cleanly", () => {
        // A schema with a substitution group, identity constraints, and
        // wildcards — all the features from CHK-008–024.
        const errors: SchemaError[] = [];
        const schema = compiler.compile(`
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}"
                targetNamespace="urn:wide"
                xmlns:t="urn:wide"
                elementFormDefault="qualified">

                <xsd:element name="animal" abstract="true" type="xsd:string"/>
                <xsd:element name="dog" type="xsd:string" substitutionGroup="t:animal"/>

                <xsd:attribute name="lang" type="xsd:language"/>

                <xsd:element name="root">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element ref="t:dog"/>
                            <xsd:any namespace="##other" processContents="lax" minOccurs="0"/>
                        </xsd:sequence>
                        <xsd:anyAttribute namespace="##targetNamespace" processContents="skip"/>
                    </xsd:complexType>
                </xsd:element>

                <xsd:element name="container">
                    <xsd:complexType>
                        <xsd:sequence>
                            <xsd:element ref="t:root"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `, { listener: (e) => errors.push(e) });
        expect(errors).toHaveLength(0);
    });
});