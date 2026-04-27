import { Checkr } from "@lib/core/main";

describe("Checkr validation", () => {
  let checkr: Checkr;

  beforeEach(() => {
    checkr = new Checkr();
  });

  describe("Simple", () => {
    it("a simple XSD structure with a valid XML should be valid.", () => {
      let xsd = `
            <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                <xsd:element name="root" type="SimpleType"/>
                <xsd:complexType name="SimpleType">
                    <xsd:sequence>
                    <xsd:element name="foo" type="xsd:string"/>
                    <xsd:element name="bar" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:schema>
            `;
      let xml = `
                <root>
                    <foo></foo>
                    <bar></bar>
                </root>
            `;
      const { valid, errors } = checkr.validate(xml, xsd);
      expect(valid).toEqual(true);
      expect(errors).toHaveLength(0);
    });

    it("a simple XSD structure with an invalid XML should be invalid.", () => {
      let xsd = `
            <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                <xsd:element name="root" type="SimpleType"/>
                <xsd:complexType name="SimpleType">
                    <xsd:sequence>
                    <xsd:element name="foo" type="xsd:string"/>
                    <xsd:element name="bar" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:schema>
            `;
      let xml = `
                <root>
                    <foo></foo>
                </root>
            `;
      const { valid, errors } = checkr.validate(xml, xsd);
      expect(valid).toEqual(false);
      expect(errors).toHaveLength(1);
      expect(errors.at(0)?.message).toEqual(
        "Element <bar> is required inside <root> but is missing.",
      );
    });

    it("a simple XSD structure with a valid namespaced XML should be valid.", () => {
      let xsd = `
                <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                            targetNamespace="urn:foo"
                            xmlns:x="urn:foo">
                    <xsd:element name="root" type="x:SimpleType"/>
                    <xsd:complexType name="SimpleType">
                        <xsd:sequence>
                            <xsd:element name="foo" type="xsd:string"/>
                            <xsd:element name="bar" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:schema>
                `;
      let xml = `
                    <x:root xmlns:x="urn:foo">
                        <foo></foo>
                        <bar></bar>
                    </x:root>
                `;
      const { valid, errors } = checkr.validate(xml, xsd);
      expect(valid).toEqual(true);
      expect(errors).toHaveLength(0);
    });

    it("a simple XSD structure with an invalid namespaced XML should be invalid.", () => {
      let xsd = `
                <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                            targetNamespace="urn:foo"
                            xmlns:x="urn:foo">
                    <xsd:element name="root" type="x:SimpleType"/>
                    <xsd:complexType name="SimpleType">
                        <xsd:sequence>
                            <xsd:element name="foo" type="xsd:string"/>
                            <xsd:element name="bar" type="xsd:string"/>
                        </xsd:sequence>
                    </xsd:complexType>
                </xsd:schema>
                `;
      let xml = `
                    <x:root xmlns:x="urn:foo">
                        <foo></foo>
                    </x:root>
                `;
      const { valid, errors } = checkr.validate(xml, xsd);
      expect(valid).toEqual(false);
      expect(errors).toHaveLength(1);
      expect(errors.at(0)?.message).toEqual(
        "Element <bar> is required inside <root> but is missing.",
      );
    });
  });

  describe("Books", () => {
    it("a books XSD structure with a valid XML should be valid.", () => {
      const xsd = `
                <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
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

      const xml = `
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
      const { valid, errors } = checkr.validate(xml, xsd);
      expect(valid).toEqual(true);
      expect(errors).toHaveLength(0);
    });

    it("a books XSD structure with an invalid XML should be invalid.", () => {
      const xsd = `
                <xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"
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

      const xml = `
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
      const { valid, errors } = checkr.validate(xml, xsd);
      expect(valid).toEqual(false);
      expect(errors).toHaveLength(1);
      expect(errors.at(0)?.message).toEqual(
        "Element <pub_date> is required inside <book> but is missing.",
      );
    });
  });

  it("validateAsync returns the same result as validate", async () => {
    const xsd = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="root" type="xs:string"/></xs:schema>`;
    const xml = `<root>hello</root>`;
    const syncResult = checkr.validate(xml, xsd);
    const asyncResult = await checkr.validateAsync(xml, xsd);
    expect(asyncResult).toEqual(syncResult);
  });
});
