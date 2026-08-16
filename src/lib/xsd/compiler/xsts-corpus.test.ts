/**
 * XSTS-derived regression corpus (CHK-028).
 *
 * This file contains a checkr-internal regression corpus of schema/instance
 * pairs derived from the W3C XML Schema Test Suite (XSTS), organised by
 * feature area against the gap analysis volume table (docs/research/gap-analysis.md §6).
 *
 * Each pair is a minimal derived fixture exercising the core behaviour of
 * one feature area.  The fixtures are NOT copies of the original XSTS data;
 * they are independently authored test cases that target the same spec
 * behaviours.  The `xstsSets` annotation in each area's description keys
 * the area to the XSTS test-set manifest file(s) that cover it.
 *
 * Attribution: W3C XML Schema Test Suite (XSTS)
 *   Copyright © 2006, 2007 World Wide Web Consortium
 *   (MIT, ERCIM, Keio, Beihang).  https://www.w3.org/XML/2004/xml-schema-test-suite/
 *   Used under the W3C Document Notice and License
 *   (https://www.w3.org/Consortium/Legal/copyright-documents-19990405.html).
 *   The cases below are derived from the spec behaviours the XSTS exercises,
 *   not from the XSTS data files themselves.
 *
 * The corpus runs as part of the test suite and reports pass/fail counts per
 * feature area via a summary table printed at the end of the suite.
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
// Corpus types
// ---------------------------------------------------------------------------

interface CorpusCase {
    name: string;
    /** The XSD source to compile. */
    xsd: string;
    /** Optional resolver for multi-document schemas. */
    resolve?: Record<string, string>;
    /** Expected schema validity. */
    expectedSchema: "valid" | "invalid";
    /** Optional instance XML to validate against the compiled schema. */
    instance?: string;
    /** Expected instance validity. Only meaningful when instance is set. */
    expectedInstance?: "valid" | "invalid";
}

interface FeatureArea {
    area: string;
    /** XSTS test-set manifest files that cover this area. */
    xstsSets: string[];
    cases: CorpusCase[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compile(xsd: string, resolve?: Record<string, string>): CompiledSchema {
    const errors: SchemaError[] = [];
    const resolver = resolve ? (loc: string) => resolve[loc] ?? null : undefined;
    const result = compiler.compile(xsd, { listener: (e) => errors.push(e), resolve: resolver });
    if (errors.length > 0) {
        throw new SchemaCompilationError(errors);
    }
    return result;
}

const XS = NAMESPACE_XSD;

// ---------------------------------------------------------------------------
// Feature areas
// ---------------------------------------------------------------------------

const AREAS: FeatureArea[] = [

    // ===================================================================
    // PART 1 — STRUCTURES
    // ===================================================================

    {
        area: "Schema element & attributes",
        xstsSets: ["Schema_w3c.xml"],
        cases: [
            {
                name: "targetNamespace + elementFormDefault",
                xsd: `<xsd:schema targetNamespace="urn:t" elementFormDefault="qualified" xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="local" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t"><t:local>val</t:local></t:root>',
                expectedInstance: "valid",
            },
            {
                name: "attributeFormDefault unqualified",
                xsd: `<xsd:schema targetNamespace="urn:t" attributeFormDefault="unqualified" xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute name="a" type="xsd:string"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t" a="val"/>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Annotations",
        xstsSets: ["Annotations_w3c.xml"],
        cases: [
            {
                name: "annotation/documentation/appinfo are inert",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:annotation>
                        <xsd:documentation>doc</xsd:documentation>
                        <xsd:appinfo>info</xsd:appinfo>
                    </xsd:annotation>
                    <xsd:element name="root" type="xsd:string"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>val</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Element declarations",
        xstsSets: ["Element_w3c.xml"],
        cases: [
            {
                name: "global element with type ref",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:string"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>val</root>',
                expectedInstance: "valid",
            },
            {
                name: "local element with inline complexType",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:integer"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t"><a>42</a></t:root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Element references",
        xstsSets: ["Element_w3c.xml"],
        cases: [
            {
                name: "ref to global element",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="child"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="child" type="xsd:string"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><child>val</child></root>',
                expectedInstance: "valid",
            },
            {
                name: "ref with minOccurs/maxOccurs",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="item" minOccurs="0" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="item" type="xsd:string"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><item>a</item><item>b</item></root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Substitution groups",
        xstsSets: ["Element_w3c.xml", "Additional_w3c.xml"],
        cases: [
            {
                name: "substitution group head + member",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="animal" abstract="true" type="xsd:string"/>
                    <xsd:element name="dog" type="xsd:string" substitutionGroup="animal"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="animal"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><dog>rex</dog></root>',
                expectedInstance: "valid",
            },
            {
                name: "abstract head directly instantiated fails",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="animal" abstract="true" type="xsd:string"/>
                    <xsd:element name="dog" type="xsd:string" substitutionGroup="animal"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="animal"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><animal>rex</animal></root>',
                expectedInstance: "invalid",
            },
        ],
    },

    {
        area: "nillable, xsi:nil, abstract, final, block",
        xstsSets: ["Element_w3c.xml", "ComplexType_w3c.xml", "Additional_w3c.xml"],
        cases: [
            {
                name: "nillable + xsi:nil",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:string" nillable="true"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/>',
                expectedInstance: "valid",
            },
            {
                name: "abstract type without xsi:type fails",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:complexType name="AbstractCT" abstract="true">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:element name="root" type="AbstractCT"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><a>val</a></root>',
                expectedInstance: "invalid",
            },
        ],
    },

    {
        area: "Element default/fixed",
        xstsSets: ["Element_w3c.xml"],
        cases: [
            {
                name: "fixed value enforced",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:string" fixed="foo"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>foo</root>',
                expectedInstance: "valid",
            },
            {
                name: "fixed value violation",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:string" fixed="foo"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>bar</root>',
                expectedInstance: "invalid",
            },
        ],
    },

    {
        area: "Attribute declarations & use",
        xstsSets: ["Attribute_w3c.xml"],
        cases: [
            {
                name: "required attribute present",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute name="a" type="xsd:string" use="required"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t" a="val"/>',
                expectedInstance: "valid",
            },
            {
                name: "missing required attribute",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute name="a" type="xsd:string" use="required"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t"/>',
                expectedInstance: "invalid",
            },
            {
                name: "attribute fixed value enforced",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute name="a" type="xsd:string" fixed="x"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t" a="x"/>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Attribute references",
        xstsSets: ["Attribute_w3c.xml"],
        cases: [
            {
                name: "attribute ref to global declaration",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:attribute name="global" type="xsd:string"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute ref="global"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root global="val"/>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Attribute groups",
        xstsSets: ["AttributeGroup_w3c.xml"],
        cases: [
            {
                name: "attributeGroup ref",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:attributeGroup name="common">
                        <xsd:attribute name="id" type="xsd:string"/>
                    </xsd:attributeGroup>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attributeGroup ref="common"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root id="x"/>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Complex types — content models",
        xstsSets: ["ComplexType_w3c.xml"],
        cases: [
            {
                name: "element-only sequence",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="b" type="xsd:integer"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><a>hi</a><b>42</b></root>',
                expectedInstance: "valid",
            },
            {
                name: "empty content rejects children",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType/>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><child>val</child></root>',
                expectedInstance: "invalid",
            },
        ],
    },

    {
        area: "Complex content derivation",
        xstsSets: ["ComplexType_w3c.xml", "Additional_w3c.xml"],
        cases: [
            {
                name: "extension adds elements",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:complexType name="Base">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:extension base="Base">
                                <xsd:sequence>
                                    <xsd:element name="b" type="xsd:string"/>
                                </xsd:sequence>
                            </xsd:extension>
                        </xsd:complexContent>
                    </xsd:complexType>
                    <xsd:element name="root" type="Derived"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><a>x</a><b>y</b></root>',
                expectedInstance: "valid",
            },
            {
                name: "invalid particle restriction rejected",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:complexType name="Base">
                        <xsd:sequence>
                            <xsd:any processContents="strict"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:complexType name="Derived">
                        <xsd:complexContent>
                            <xsd:restriction base="Base">
                                <xsd:sequence>
                                    <xsd:any processContents="lax"/>
                                </xsd:sequence>
                            </xsd:restriction>
                        </xsd:complexContent>
                    </xsd:complexType>
                    <xsd:element name="root" type="Derived"/>
                </xsd:schema>`,
                expectedSchema: "invalid",
            },
        ],
    },

    {
        area: "Simple content",
        xstsSets: ["ComplexType_w3c.xml"],
        cases: [
            {
                name: "simpleContent extension (text + attribute)",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:complexType name="Extended">
                        <xsd:simpleContent>
                            <xsd:extension base="xsd:string">
                                <xsd:attribute name="unit" type="xsd:string"/>
                            </xsd:extension>
                        </xsd:simpleContent>
                    </xsd:complexType>
                    <xsd:element name="root" type="Extended"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root unit="cm">13.5</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Mixed content",
        xstsSets: ["ComplexType_w3c.xml"],
        cases: [
            {
                name: "mixed content with text and elements",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="p">
                        <xsd:complexType mixed="true">
                            <xsd:sequence>
                                <xsd:element name="em" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<p>some <em>emphasised</em> text</p>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Model groups: sequence, choice",
        xstsSets: ["ModelGroups_w3c.xml"],
        cases: [
            {
                name: "sequence order enforced",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="b" type="xsd:string"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><a>x</a><b>y</b></root>',
                expectedInstance: "valid",
            },
            {
                name: "choice alternatives",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:choice>
                                <xsd:element name="a" type="xsd:string"/>
                                <xsd:element name="b" type="xsd:integer"/>
                            </xsd:choice>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><b>42</b></root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Model group: all",
        xstsSets: ["ModelGroups_w3c.xml"],
        cases: [
            {
                name: "all unordered",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:complexType name="AT">
                        <xsd:all>
                            <xsd:element name="a" type="xsd:string"/>
                            <xsd:element name="b" type="xsd:integer"/>
                        </xsd:all>
                    </xsd:complexType>
                    <xsd:element name="root" type="tns:AT"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t"><b>42</b><a>x</a></t:root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Named model groups",
        xstsSets: ["Group_w3c.xml"],
        cases: [
            {
                name: "group def + ref",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:group name="g">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:group>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:group ref="tns:g"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t"><a>val</a></t:root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Particles / occurrence",
        xstsSets: ["Particles_w3c.xml"],
        cases: [
            {
                name: "minOccurs/maxOccurs/unbounded",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string" minOccurs="0" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><a>x</a><a>y</a><a>z</a></root>',
                expectedInstance: "valid",
            },
            {
                name: "minOccurs violation",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" type="xsd:string" minOccurs="2"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><a>x</a></root>',
                expectedInstance: "invalid",
            },
        ],
    },

    {
        area: "Wildcards",
        xstsSets: ["Wildcards_w3c.xml"],
        cases: [
            {
                name: "xs:any strict",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:complexType name="WT">
                        <xsd:sequence>
                            <xsd:any namespace="##targetNamespace" processContents="strict"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:element name="root" type="tns:WT"/>
                    <xsd:element name="declared" type="xsd:string"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t"><t:declared>val</t:declared></t:root>',
                expectedInstance: "valid",
            },
            {
                name: "xs:any strict undeclared fails",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:complexType name="WT">
                        <xsd:sequence>
                            <xsd:any namespace="##targetNamespace" processContents="strict"/>
                        </xsd:sequence>
                    </xsd:complexType>
                    <xsd:element name="root" type="tns:WT"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t"><undeclared>val</undeclared></t:root>',
                expectedInstance: "invalid",
            },
            {
                name: "anyAttribute",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:complexType name="AT">
                        <xsd:sequence>
                            <xsd:element name="a" type="xsd:string"/>
                        </xsd:sequence>
                        <xsd:anyAttribute namespace="##any" processContents="skip"/>
                    </xsd:complexType>
                    <xsd:element name="root" type="tns:AT"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t" xmlns:x="urn:ext" x:extra="val"><a>x</a></t:root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Identity constraints",
        xstsSets: ["IdentityConstraint_w3c.xml"],
        cases: [
            {
                name: "unique selector/field",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="item" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="uq">
                            <xsd:selector xpath=".//item"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><item>a</item><item>b</item></root>',
                expectedInstance: "valid",
            },
            {
                name: "unique violation",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="item" type="xsd:string" maxOccurs="unbounded"/>
                            </xsd:sequence>
                        </xsd:complexType>
                        <xsd:unique name="uq">
                            <xsd:selector xpath=".//item"/>
                            <xsd:field xpath="."/>
                        </xsd:unique>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><item>a</item><item>a</item></root>',
                expectedInstance: "invalid",
            },
        ],
    },

    {
        area: "Notations",
        xstsSets: ["Notations_w3c.xml"],
        cases: [
            {
                name: "notation declaration + NOTATION-typed value",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:notation name="gif" public="image/gif"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:attribute name="fmt" type="xsd:NOTATION"/>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t" xmlns="urn:t" fmt="gif"/>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "include / import / redefine",
        xstsSets: ["Schema_w3c.xml", "Additional_w3c.xml"],
        cases: [
            {
                name: "xs:include same-namespace merge",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="included"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:include schemaLocation="inc.xsd"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root><included>val</included></root>',
                expectedInstance: "valid",
                resolve: { "inc.xsd": `<xsd:schema xmlns:xsd="${XS}"><xsd:element name="included" type="xsd:string"/></xsd:schema>` },
            },
            {
                name: "xs:import foreign grammar",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:import namespace="urn:other" schemaLocation="other.xsd"/>
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element ref="tns:local"/>
                                <xsd:any namespace="urn:other" processContents="lax"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                    <xsd:element name="local" type="xsd:string"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t" xmlns:o="urn:other"><t:local>x</t:local><o:other>val</o:other></t:root>',
                expectedInstance: "valid",
                resolve: { "other.xsd": `<xsd:schema targetNamespace="urn:other" xmlns:xsd="${XS}"><xsd:element name="other" type="xsd:string"/></xsd:schema>` },
            },
        ],
    },

    {
        area: "xsi:type, xsi:schemaLocation",
        xstsSets: ["Additional_w3c.xml"],
        cases: [
            {
                name: "xsi:schemaLocation hint",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:element name="root" type="xsd:string"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:t nowhere.xsd">val</t:root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Schema conformance",
        xstsSets: ["Schema_w3c.xml"],
        cases: [
            {
                name: "duplicate facet rejected",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="Bad">
                        <xsd:restriction base="xsd:string">
                            <xsd:length value="2"/>
                            <xsd:length value="4"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:schema>`,
                expectedSchema: "invalid",
            },
            {
                name: "minOccurs > maxOccurs rejected",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="x">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="a" minOccurs="2" maxOccurs="1"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "invalid",
            },
        ],
    },

    {
        area: "Errata 1.0 fixes",
        xstsSets: ["Errata10_w3c.xml"],
        cases: [
            {
                name: "anyType lax processContents",
                xsd: `<xsd:schema targetNamespace="urn:t" xmlns:xsd="${XS}" xmlns:tns="urn:t">
                    <xsd:element name="root">
                        <xsd:complexType>
                            <xsd:sequence>
                                <xsd:element name="u" type="xsd:anyType"/>
                            </xsd:sequence>
                        </xsd:complexType>
                    </xsd:element>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<t:root xmlns:t="urn:t"><u><unknown>text</unknown></u></t:root>',
                expectedInstance: "valid",
            },
        ],
    },

    // ===================================================================
    // PART 2 — DATATYPES
    // ===================================================================

    {
        area: "String family built-ins",
        xstsSets: ["DataTypes_w3c.xml", "NISTXMLSchemaDatatypes"],
        cases: [
            {
                name: "token collapse",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:token"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>simple value</root>',
                expectedInstance: "valid",
            },
            {
                name: "language",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:language"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>en-US</root>',
                expectedInstance: "valid",
            },
            {
                name: "NCName",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:NCName"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>_validName</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Numeric family built-ins",
        xstsSets: ["DataTypes_w3c.xml", "NISTXMLSchemaDatatypes"],
        cases: [
            {
                name: "integer bounds",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:integer"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>42</root>',
                expectedInstance: "valid",
            },
            {
                name: "decimal fractionDigits",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="Price">
                        <xsd:restriction base="xsd:decimal">
                            <xsd:fractionDigits value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root" type="Price"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>12.99</root>',
                expectedInstance: "valid",
            },
            {
                name: "float special values",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:float"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>INF</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Date/time family built-ins",
        xstsSets: ["DataTypes_w3c.xml", "NISTXMLSchemaDatatypes"],
        cases: [
            {
                name: "dateTime",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:dateTime"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>2023-01-15T10:30:00</root>',
                expectedInstance: "valid",
            },
            {
                name: "duration",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:duration"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>P1Y2M3DT4H5M6S</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Boolean",
        xstsSets: ["DataTypes_w3c.xml", "NISTXMLSchemaDatatypes"],
        cases: [
            {
                name: "boolean true/false",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:boolean"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>true</root>',
                expectedInstance: "valid",
            },
            {
                name: "boolean 1/0",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:boolean"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>1</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Binary (hexBinary, base64Binary)",
        xstsSets: ["DataTypes_w3c.xml"],
        cases: [
            {
                name: "hexBinary",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:hexBinary"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>0F1A2B</root>',
                expectedInstance: "valid",
            },
            {
                name: "base64Binary",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:base64Binary"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>SGVsbG8=</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "anyURI, QName, NOTATION",
        xstsSets: ["DataTypes_w3c.xml"],
        cases: [
            {
                name: "anyURI",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:element name="root" type="xsd:anyURI"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>http://example.com/path</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "Facets",
        xstsSets: ["DataTypes_w3c.xml"],
        cases: [
            {
                name: "enumeration",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="Color">
                        <xsd:restriction base="xsd:string">
                            <xsd:enumeration value="red"/>
                            <xsd:enumeration value="blue"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root" type="Color"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>red</root>',
                expectedInstance: "valid",
            },
            {
                name: "enumeration violation",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="Color">
                        <xsd:restriction base="xsd:string">
                            <xsd:enumeration value="red"/>
                            <xsd:enumeration value="blue"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root" type="Color"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>green</root>',
                expectedInstance: "invalid",
            },
            {
                name: "pattern facet",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="Zip">
                        <xsd:restriction base="xsd:string">
                            <xsd:pattern value="[0-9]{5}"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root" type="Zip"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>12345</root>',
                expectedInstance: "valid",
            },
            {
                name: "minInclusive/maxInclusive bounds",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="Range">
                        <xsd:restriction base="xsd:integer">
                            <xsd:minInclusive value="1"/>
                            <xsd:maxInclusive value="10"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root" type="Range"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>5</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "XSD regex",
        xstsSets: ["Regex_w3c.xml"],
        cases: [
            {
                name: "pattern with XSD character class subtraction",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="NoDigit">
                        <xsd:restriction base="xsd:string">
                            <xsd:pattern value="[\\p{L}-[\\p{N}]]*"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root" type="NoDigit"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>abc</root>',
                expectedInstance: "valid",
            },
            {
                name: "pattern with \\i \\c name escapes",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="NameLike">
                        <xsd:restriction base="xsd:string">
                            <xsd:pattern value="\\i\\c*"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root" type="NameLike"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>abc123</root>',
                expectedInstance: "valid",
            },
            {
                name: "pattern with \\c matching letters (reDC4-style)",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="HttpLike">
                        <xsd:restriction base="xsd:string">
                            <xsd:pattern value="http://\\c*"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                    <xsd:element name="root" type="HttpLike"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>http://www.foo.com</root>',
                expectedInstance: "valid",
            },
        ],
    },

    {
        area: "List and union types",
        xstsSets: ["NISTXMLSchemaDatatypes"],
        cases: [
            {
                name: "list of integers",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="IntList">
                        <xsd:list itemType="xsd:integer"/>
                    </xsd:simpleType>
                    <xsd:element name="root" type="IntList"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>1 2 3</root>',
                expectedInstance: "valid",
            },
            {
                name: "union of string and integer",
                xsd: `<xsd:schema xmlns:xsd="${XS}">
                    <xsd:simpleType name="StrOrInt">
                        <xsd:union memberTypes="xsd:string xsd:integer"/>
                    </xsd:simpleType>
                    <xsd:element name="root" type="StrOrInt"/>
                </xsd:schema>`,
                expectedSchema: "valid",
                instance: '<root>42</root>',
                expectedInstance: "valid",
            },
        ],
    },

];

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const areaCounts = new Map<string, { pass: number; fail: number }>();

const report: string[] = [];

function runCase(area: string, c: CorpusCase): void {
    // Compile
    let schema: CompiledSchema;
    let schemaOk = true;
    try {
        schema = compile(c.xsd, c.resolve);
    } catch (e) {
        schemaOk = false;
    }
    expect(schemaOk).toBe(c.expectedSchema === "valid");

    // Instance
    if (c.instance && c.expectedInstance !== undefined) {
        const validator = new InstanceValidatorImpl(new XMLParserImpl());
        const errors: SchemaError[] = [];
        try {
            schema = compile(c.xsd, c.resolve);
        } catch {
            // Schema failed — skip instance validation
            return;
        }
        const result = validator.validate(c.instance, schema, { listener: (e) => errors.push(e) });
        expect(result.valid).toBe(c.expectedInstance === "valid");
    }
}

// ---------------------------------------------------------------------------
// Register all areas
// ---------------------------------------------------------------------------

describe("XSTS-derived regression corpus (CHK-028)", () => {

    afterAll(() => {
        console.log("\n=== XSTS Corpus — per-feature-area pass/fail ===");
        for (const a of AREAS) {
            const cnt = areaCounts.get(a.area) ?? { pass: 0, fail: 0 };
            const status = cnt.fail === 0 ? "✓" : "✗";
            console.log(`  ${status} ${a.area}: ${cnt.pass}/${cnt.pass + cnt.fail} passed`);
        }
        console.log("");
    });

    for (const a of AREAS) {
        describe(a.area, () => {
            let pass = 0, fail = 0;

            for (const c of a.cases) {
                it(c.name, () => {
                    try {
                        runCase(a.area, c);
                        pass++;
                    } catch (e) {
                        fail++;
                        throw e;
                    } finally {
                        areaCounts.set(a.area, { pass, fail });
                    }
                });
            }
        });
    }
});