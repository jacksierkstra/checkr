import { compileSchema, validate } from "@lib/core/compiled";
import { CompiledSchema } from "@lib/types/component-graph";
import { NAMESPACE_XSD } from "@lib/types/namespaces";
import { SchemaCompilationError, SchemaError } from "@lib/types/schema-error";

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

describe("public two-phase surface — compileSchema / validate (CHK-008)", () => {

    it("compiles and validates a conforming instance end-to-end", () => {
        const schema = compileSchema(MINIMAL_XSD);
        const { valid, errors } = validate(`<root><foo>a</foo><bar>b</bar></root>`, schema);
        expect(valid).toBe(true);
        expect(errors).toHaveLength(0);
    });

    it("compiles and validates a non-conforming instance end-to-end", () => {
        const schema = compileSchema(MINIMAL_XSD);
        const { valid, errors } = validate(`<root><foo>a</foo></root>`, schema);
        expect(valid).toBe(false);
        expect(errors[0]).toMatchObject({ code: "MISSING_REQUIRED_ELEMENT", phase: "instance-validation" });
    });

    it("throws SchemaCompilationError and reports through the compile listener on bad schemas", () => {
        const brokenXsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:element name="root" type="MissingType"/>
            </xsd:schema>
        `;
        const seen: SchemaError[] = [];
        expect(() => compileSchema(brokenXsd, { listener: (e) => seen.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(seen[0]!.code).toBe("UNRESOLVED_TYPE");
    });

    it("reports validation errors through the validate listener", () => {
        const schema = compileSchema(MINIMAL_XSD);
        const seen: SchemaError[] = [];
        const { valid, errors } = validate(`<root><foo>a</foo></root>`, schema, {
            listener: (e) => seen.push(e),
        });
        expect(valid).toBe(false);
        expect(seen).toEqual(errors);
    });

    it("compileSchema results are frozen and reusable across validate calls", () => {
        const schema = compileSchema(MINIMAL_XSD);
        expect(Object.isFrozen(schema)).toBe(true);
        expect(validate(`<root><foo>a</foo><bar>b</bar></root>`, schema).valid).toBe(true);
        expect(validate(`<root><foo>a</foo></root>`, schema).valid).toBe(false);
        const before = JSON.stringify((schema as unknown as { grammars: unknown }).grammars);
        validate(`<root/>`, schema);
        expect(JSON.stringify((schema as unknown as { grammars: unknown }).grammars)).toBe(before);
    });

    it("compiles a schema from a string input — mutation of the input has no channel to the compiled graph", () => {
        // The API accepts an immutable string; the compiled graph is a fresh,
        // frozen object tree with no reference back to the input document.
        const schema: CompiledSchema = compileSchema(MINIMAL_XSD);
        expect(schema.grammars.get("")!.elements.get("root")!.type).not.toBeNull();
        expect(Object.isFrozen(schema.grammars.get("")!.elements.get("root")!)).toBe(true);
    });

});

// Migrated from the legacy single-shot surface (CHK-009 contracts the flat
// model): the books scenario exercised `new Checkr().validate()` end-to-end.
// The new surface covers the same behavior through compileSchema/validate.
describe("public two-phase surface — migrated from the legacy single-shot API (CHK-009)", () => {

    const BOOKS_XSD = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}"
        targetNamespace="urn:books"
        xmlns:bks="urn:books">
            <xsd:element name="books" type="bks:BooksForm"/>
            <xsd:complexType name="BooksForm">
                <xsd:sequence>
                    <xsd:element name="book"
                                type="bks:BookForm"
                                minOccurs="0"
                                maxOccurs="unbounded"/>
                </xsd:sequence>
            </xsd:complexType>
            <xsd:complexType name="BookForm">
                <xsd:sequence>
                    <xsd:element name="author"   type="xsd:string"/>
                    <xsd:element name="title"    type="xsd:string"/>
                    <xsd:element name="genre"    type="xsd:string"/>
                    <xsd:element name="price"    type="xsd:float" />
                    <xsd:element name="pub_date" type="xsd:date" />
                    <xsd:element name="review"   type="xsd:string"/>
                </xsd:sequence>
                <xsd:attribute name="id"   type="xsd:string"/>
            </xsd:complexType>
        </xsd:schema>
    `;

    const BOOKS_XML_VALID = `
        <?xml version="1.0"?>
        <x:books xmlns:x="urn:books">
            <book id="bk001">
                <author>Writer</author>
                <title>The First Book</title>
                <genre>Fiction</genre>
                <price>44.95</price>
                <pub_date>2000-10-01</pub_date>
                <review>An amazing story of nothing.</review>
            </book>
            <book id="bk002">
                <author>Poet</author>
                <title>The Poet's First Poem</title>
                <genre>Poem</genre>
                <price>24.95</price>
                <pub_date>2000-10-01</pub_date>
                <review>Least poetic poems.</review>
            </book>
        </x:books>
    `;

    const BOOKS_XML_INVALID = `
        <?xml version="1.0"?>
        <x:books xmlns:x="urn:books">
            <book id="bk001">
                <author>Writer</author>
                <title>The First Book</title>
                <genre>Fiction</genre>
                <price>44.95</price>
                <pub_date>2000-10-01</pub_date>
                <review>An amazing story of nothing.</review>
            </book>
            <book id="bk002">
                <author>Poet</author>
                <title>The Poet's First Poem</title>
                <genre>Poem</genre>
                <price>24.95</price>
                <review>Least poetic poems.</review>
            </book>
        </x:books>
    `;

    it("validates a conforming books instance end-to-end", () => {
        const schema = compileSchema(BOOKS_XSD);
        const { valid, errors } = validate(BOOKS_XML_VALID, schema);
        expect(valid).toBe(true);
        expect(errors).toHaveLength(0);
    });

    it("rejects a books instance with a missing required element", () => {
        const schema = compileSchema(BOOKS_XSD);
        const { valid, errors } = validate(BOOKS_XML_INVALID, schema);
        expect(valid).toBe(false);
        const missing = errors.filter((e) => e.code === "MISSING_REQUIRED_ELEMENT");
        expect(missing.some((e) => e.message.includes("pub_date"))).toBe(true);
    });

});
// ---------------------------------------------------------------------------
// XSD regex engine — pattern facet end-to-end (CHK-015)
// ---------------------------------------------------------------------------

describe("pattern facet end-to-end (CHK-015)", () => {

    it("validates instance text against a pattern facet", () => {
        const xsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:simpleType name="VowelString">
                    <xsd:restriction base="xsd:string">
                        <xsd:pattern value="[aeiou]+"/>
                    </xsd:restriction>
                </xsd:simpleType>
                <xsd:element name="e" type="VowelString"/>
            </xsd:schema>
        `;
        const schema = compileSchema(xsd);
        expect(validate(`<e>aeiou</e>`, schema).valid).toBe(true);
        expect(validate(`<e>bcdf</e>`, schema).valid).toBe(false);
        const { errors } = validate(`<e>bcdf</e>`, schema);
        expect(errors.some((e) => e.code === "FACET_VIOLATION")).toBe(true);
    });

    it("validates attribute values against a pattern facet", () => {
        const xsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:simpleType name="Code">
                    <xsd:restriction base="xsd:string">
                        <xsd:pattern value="[A-Z]{3}"/>
                    </xsd:restriction>
                </xsd:simpleType>
                <xsd:element name="e">
                    <xsd:complexType>
                        <xsd:attribute name="code" type="Code" use="required"/>
                    </xsd:complexType>
                </xsd:element>
            </xsd:schema>
        `;
        const schema = compileSchema(xsd);
        expect(validate(`<e code="ABC"/>`, schema).valid).toBe(true);
        expect(validate(`<e code="AB"/>`, schema).valid).toBe(false);
    });

    it("rejects an invalid pattern at compile time", () => {
        const xsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:simpleType name="BadPattern">
                    <xsd:restriction base="xsd:string">
                        <xsd:pattern value="[a-z-[invalid]"/>
                    </xsd:restriction>
                </xsd:simpleType>
                <xsd:element name="e" type="BadPattern"/>
            </xsd:schema>
        `;
        const seen: SchemaError[] = [];
        expect(() => compileSchema(xsd, { listener: (e) => seen.push(e) }))
            .toThrow(SchemaCompilationError);
        expect(seen.some((e) => e.code === "INVALID_PATTERN")).toBe(true);
    });

    it("pattern with subtraction works end-to-end", () => {
        const xsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:simpleType name="ConsonantString">
                    <xsd:restriction base="xsd:string">
                        <xsd:pattern value="[a-z-[aeiou]]+"/>
                    </xsd:restriction>
                </xsd:simpleType>
                <xsd:element name="e" type="ConsonantString"/>
            </xsd:schema>
        `;
        const schema = compileSchema(xsd);
        expect(validate(`<e>bcd</e>`, schema).valid).toBe(true);
        expect(validate(`<e>aei</e>`, schema).valid).toBe(false);
    });

    it("multiple pattern facets: all must match", () => {
        const xsd = `
            <xsd:schema xmlns:xsd="${NAMESPACE_XSD}">
                <xsd:simpleType name="AlphaNum">
                    <xsd:restriction base="xsd:string">
                        <xsd:pattern value="[a-z]+"/>
                        <xsd:pattern value=".{3,5}"/>
                    </xsd:restriction>
                </xsd:simpleType>
                <xsd:element name="e" type="AlphaNum"/>
            </xsd:schema>
        `;
        const schema = compileSchema(xsd);
        // "abc" matches both [a-z]+ and .{3,5}
        expect(validate(`<e>abc</e>`, schema).valid).toBe(true);
        // "ab" matches [a-z]+ but not .{3,5}
        expect(validate(`<e>ab</e>`, schema).valid).toBe(false);
        // "ab123" matches .{3,5} but not [a-z]+
        expect(validate(`<e>ab123</e>`, schema).valid).toBe(false);
    });

});

// ---------------------------------------------------------------------------
// List and union types — NIST-style end-to-end through the two-phase API (CHK-016)
// ---------------------------------------------------------------------------

describe("list and union types end-to-end (CHK-016)", () => {

    // NIST-style datatypes: a list of integers, a union of integer/date, and
    // a list whose item type is itself restricted, all used as element types.
    const NIST_XSD = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}"
                    targetNamespace="urn:nist"
                    xmlns:t="urn:nist">
            <xsd:simpleType name="intList">
                <xsd:list itemType="xsd:integer"/>
            </xsd:simpleType>
            <xsd:simpleType name="intOrDate">
                <xsd:union memberTypes="xsd:integer xsd:date"/>
            </xsd:simpleType>
            <xsd:simpleType name="twoDigitTokens">
                <xsd:list>
                    <xsd:simpleType>
                        <xsd:restriction base="xsd:token">
                            <xsd:length value="2"/>
                        </xsd:restriction>
                    </xsd:simpleType>
                </xsd:list>
            </xsd:simpleType>
            <xsd:element name="root">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="sizes" type="t:intList"/>
                        <xsd:element name="when" type="t:intOrDate"/>
                        <xsd:element name="tags" type="t:twoDigitTokens"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    `;

    it("accepts a conforming instance end-to-end", () => {
        const schema = compileSchema(NIST_XSD);
        const xml = `<t:root xmlns:t="urn:nist"><sizes>1 2 3</sizes><when>2000-01-01</when><tags>ab cd</tags></t:root>`;
        const { valid, errors } = validate(xml, schema);
        expect(valid).toBe(true);
        expect(errors).toHaveLength(0);
    });

    it("accepts the union via its other member and the list with one item", () => {
        const schema = compileSchema(NIST_XSD);
        const xml = `<t:root xmlns:t="urn:nist"><sizes>42</sizes><when>2020</when><tags>xy</tags></t:root>`;
        expect(validate(xml, schema).valid).toBe(true);
    });

    it("rejects an instance with a non-integer list item", () => {
        const schema = compileSchema(NIST_XSD);
        const xml = `<t:root xmlns:t="urn:nist"><sizes>1 x 3</sizes><when>2020</when><tags>ab cd</tags></t:root>`;
        const { valid, errors } = validate(xml, schema);
        expect(valid).toBe(false);
        expect(errors.some((e) => e.code === "LEXICAL_SPACE_VIOLATION")).toBe(true);
    });

    it("rejects a union value valid in no member and a list item failing its item type", () => {
        const schema = compileSchema(NIST_XSD);
        const xml = `<t:root xmlns:t="urn:nist"><sizes>1 2 3</sizes><when>hello</when><tags>abcd e</tags></t:root>`;
        const { valid, errors } = validate(xml, schema);
        expect(valid).toBe(false);
        expect(errors.some((e) => e.code === "UNION_VIOLATION")).toBe(true);
        expect(errors.some((e) => e.code === "FACET_VIOLATION")).toBe(true); // "abcd" violates length=2
    });

    it("keeps the compiled schema immutable and reusable across list/union runs", () => {
        const schema = compileSchema(NIST_XSD);
        expect(Object.isFrozen(schema)).toBe(true);
        expect(validate(`<t:root xmlns:t="urn:nist"><sizes>1 2</sizes><when>2020</when><tags>ab</tags></t:root>`, schema).valid).toBe(true);
        expect(validate(`<t:root xmlns:t="urn:nist"><sizes>a</sizes><when>2020</when><tags>ab</tags></t:root>`, schema).valid).toBe(false);
        expect(validate(`<t:root xmlns:t="urn:nist"><sizes>1 2</sizes><when>2020</when><tags>ab</tags></t:root>`, schema).valid).toBe(true);
    });

});

// ---------------------------------------------------------------------------
// QName resolution — namespaced schema with qualified children (CHK-017)
// ---------------------------------------------------------------------------

describe("namespaced schema with qualified children end-to-end (CHK-017)", () => {

    // The benchmark books fixture, but with elementFormDefault=qualified so
    // every local element is namespace-qualified and must match by namespace.
    const BOOKS_XSD_QUALIFIED = `
        <xsd:schema xmlns:xsd="${NAMESPACE_XSD}"
        targetNamespace="urn:books"
        xmlns:bks="urn:books"
        elementFormDefault="qualified">
            <xsd:element name="books" type="bks:BooksForm"/>
            <xsd:complexType name="BooksForm">
                <xsd:sequence>
                    <xsd:element name="book" type="bks:BookForm" minOccurs="0" maxOccurs="unbounded"/>
                </xsd:sequence>
            </xsd:complexType>
            <xsd:complexType name="BookForm">
                <xsd:sequence>
                    <xsd:element name="author" type="xsd:string"/>
                    <xsd:element name="title" type="xsd:string"/>
                    <xsd:element name="price" type="xsd:float"/>
                </xsd:sequence>
                <xsd:attribute name="id" type="xsd:string"/>
            </xsd:complexType>
        </xsd:schema>
    `;

    const VALID = `
        <x:books xmlns:x="urn:books" xmlns="urn:books">
            <book id="b1"><author>A</author><title>T</title><price>44.95</price></book>
            <book id="b2"><author>B</author><title>T2</title><price>1.5</price></book>
        </x:books>
    `;

    const MISSING_TITLE = `
        <x:books xmlns:x="urn:books" xmlns="urn:books">
            <book id="b1"><author>A</author><price>44.95</price></book>
        </x:books>
    `;

    it("validates a namespaced instance with qualified children end-to-end", () => {
        const schema = compileSchema(BOOKS_XSD_QUALIFIED);
        const { valid, errors } = validate(VALID, schema);
        expect(valid).toBe(true);
        expect(errors).toHaveLength(0);
    });

    it("rejects a namespaced instance missing a required qualified child", () => {
        const schema = compileSchema(BOOKS_XSD_QUALIFIED);
        const { valid, errors } = validate(MISSING_TITLE, schema);
        expect(valid).toBe(false);
        expect(errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT" && e.message.includes("title"))).toBe(true);
    });

    it("rejects a qualified child that is pushed out of the namespace", () => {
        const schema = compileSchema(BOOKS_XSD_QUALIFIED);
        const xml = `
            <x:books xmlns:x="urn:books">
                <book xmlns="" id="b1"><author xmlns="urn:books">A</author><title xmlns="urn:books">T</title><price xmlns="urn:books">44.95</price></book>
            </x:books>
        `;
        const { valid, errors } = validate(xml, schema);
        expect(valid).toBe(false);
        expect(errors.some((e) => e.code === "UNEXPECTED_ELEMENT" && e.message.includes("book"))).toBe(true);
    });

});
