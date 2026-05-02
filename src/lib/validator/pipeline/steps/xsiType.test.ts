import { Checkr } from "@lib/core/main";

// All tests use Checkr (the public API) to exercise the full xsi:type path.
const checkr = new Checkr();

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSchema(extra: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  ${extra}
</xs:schema>`;
}

// ─── 1. No xsi:type — existing behaviour unchanged ──────────────────────────

describe("xsi:type — no attribute present", () => {
  it("validates a concrete element without xsi:type normally", () => {
    const xsd = makeSchema(`
      <xs:element name="color" type="xs:string"/>
    `);
    const xml = `<color>red</color>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(true);
  });
});

// ─── 2. Abstract base type satisfied by xsi:type ────────────────────────────

describe("xsi:type — abstract base satisfied by derived type", () => {
  const xsd = makeSchema(`
    <xs:element name="shape" type="ShapeType"/>
    <xs:complexType name="ShapeType" abstract="true">
      <xs:sequence>
        <xs:element name="color" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
    <xs:complexType name="CircleType">
      <xs:complexContent>
        <xs:extension base="ShapeType">
          <xs:sequence>
            <xs:element name="radius" type="xs:decimal"/>
          </xs:sequence>
        </xs:extension>
      </xs:complexContent>
    </xs:complexType>
  `);

  it("accepts a valid derived type via xsi:type", () => {
    const xml = `<shape xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CircleType">
      <color>red</color>
      <radius>5.0</radius>
    </shape>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects the abstract base without xsi:type", () => {
    const xml = `<shape><color>red</color></shape>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "ABSTRACT_ELEMENT")).toBe(true);
  });

  it("rejects xsi:type that is not derived from the declared type", () => {
    const xsdWithExtra = makeSchema(`
      <xs:element name="shape" type="ShapeType"/>
      <xs:complexType name="ShapeType" abstract="true">
        <xs:sequence>
          <xs:element name="color" type="xs:string"/>
        </xs:sequence>
      </xs:complexType>
      <xs:complexType name="CircleType">
        <xs:complexContent>
          <xs:extension base="ShapeType">
            <xs:sequence>
              <xs:element name="radius" type="xs:decimal"/>
            </xs:sequence>
          </xs:extension>
        </xs:complexContent>
      </xs:complexType>
      <xs:complexType name="UnrelatedType">
        <xs:sequence>
          <xs:element name="foo" type="xs:string"/>
        </xs:sequence>
      </xs:complexType>
    `);
    const xml = `<shape xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="UnrelatedType">
      <foo>bar</foo>
    </shape>`;
    const result = checkr.validate(xml, xsdWithExtra);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "TYPE_MISMATCH")).toBe(true);
  });
});

// ─── 3. Unresolvable xsi:type value ─────────────────────────────────────────

describe("xsi:type — unresolvable type name", () => {
  it("returns TYPE_MISMATCH when the type is not in the schema", () => {
    const xsd = makeSchema(`
      <xs:element name="item" type="xs:string"/>
    `);
    const xml = `<item xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="NonExistent">hello</item>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "TYPE_MISMATCH")).toBe(true);
  });
});

// ─── 4. Derivation blocked by block attribute ────────────────────────────────

describe("xsi:type — derivation blocked by block attribute", () => {
  it("returns DERIVATION_BLOCKED when block='extension' prevents substitution", () => {
    const xsd = makeSchema(`
      <xs:element name="shape" type="ShapeType" block="extension"/>
      <xs:complexType name="ShapeType">
        <xs:sequence>
          <xs:element name="color" type="xs:string"/>
        </xs:sequence>
      </xs:complexType>
      <xs:complexType name="CircleType">
        <xs:complexContent>
          <xs:extension base="ShapeType">
            <xs:sequence>
              <xs:element name="radius" type="xs:decimal"/>
            </xs:sequence>
          </xs:extension>
        </xs:complexContent>
      </xs:complexType>
    `);
    const xml = `<shape xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CircleType">
      <color>red</color>
      <radius>5.0</radius>
    </shape>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DERIVATION_BLOCKED")).toBe(true);
  });

  it("returns DERIVATION_BLOCKED when block='#all' prevents substitution", () => {
    const xsd = makeSchema(`
      <xs:element name="shape" type="ShapeType" block="#all"/>
      <xs:complexType name="ShapeType">
        <xs:sequence>
          <xs:element name="color" type="xs:string"/>
        </xs:sequence>
      </xs:complexType>
      <xs:complexType name="CircleType">
        <xs:complexContent>
          <xs:extension base="ShapeType">
            <xs:sequence>
              <xs:element name="radius" type="xs:decimal"/>
            </xs:sequence>
          </xs:extension>
        </xs:complexContent>
      </xs:complexType>
    `);
    const xml = `<shape xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CircleType">
      <color>red</color><radius>5</radius>
    </shape>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DERIVATION_BLOCKED")).toBe(true);
  });
});

// ─── 5. Built-in xs: type on an anyType element ─────────────────────────────

describe("xsi:type — xs: built-in types are accepted", () => {
  it("accepts xsi:type='xs:string' without error for a simple string element", () => {
    const xsd = makeSchema(`
      <xs:element name="value" type="xs:string"/>
    `);
    const xml = `<value xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">hello</value>`;
    // Built-in types are accepted as-is; normal validation continues unchanged.
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(true);
  });
});

// ─── 6. Namespace-prefix independence ───────────────────────────────────────

describe("xsi:type — namespace-prefix independence", () => {
  it("recognises xsi:type regardless of the namespace prefix used", () => {
    const xsd = makeSchema(`
      <xs:element name="shape" type="ShapeType"/>
      <xs:complexType name="ShapeType" abstract="true">
        <xs:sequence>
          <xs:element name="color" type="xs:string"/>
        </xs:sequence>
      </xs:complexType>
      <xs:complexType name="CircleType">
        <xs:complexContent>
          <xs:extension base="ShapeType">
            <xs:sequence>
              <xs:element name="radius" type="xs:decimal"/>
            </xs:sequence>
          </xs:extension>
        </xs:complexContent>
      </xs:complexType>
    `);
    // Uses 'inst' instead of the conventional 'xsi' prefix.
    const xml = `<shape xmlns:inst="http://www.w3.org/2001/XMLSchema-instance" inst:type="CircleType">
      <color>blue</color>
      <radius>3.14</radius>
    </shape>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── 7. Content validated against substituted type ──────────────────────────

describe("xsi:type — content validated against substituted type", () => {
  const xsd = makeSchema(`
    <xs:element name="shape" type="ShapeType"/>
    <xs:complexType name="ShapeType" abstract="true">
      <xs:sequence>
        <xs:element name="color" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
    <xs:complexType name="CircleType">
      <xs:complexContent>
        <xs:extension base="ShapeType">
          <xs:sequence>
            <xs:element name="radius" type="xs:decimal"/>
          </xs:sequence>
        </xs:extension>
      </xs:complexContent>
    </xs:complexType>
  `);

  it("rejects CircleType content where radius is not a decimal", () => {
    const xml = `<shape xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CircleType">
      <color>red</color>
      <radius>not-a-number</radius>
    </shape>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "TYPE_MISMATCH")).toBe(true);
  });

  it("rejects CircleType content that is missing a required child from the base type", () => {
    const xml = `<shape xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CircleType">
      <radius>5.0</radius>
    </shape>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_REQUIRED_ELEMENT")).toBe(true);
  });
});

// ─── 8. Restriction-based derivation via xsi:type ───────────────────────────

describe("xsi:type — restriction-based derivation", () => {
  it("accepts a valid restriction-derived type via xsi:type", () => {
    const xsd = makeSchema(`
      <xs:element name="age" type="AgeBase"/>
      <xs:complexType name="AgeBase">
        <xs:sequence>
          <xs:element name="value" type="xs:integer"/>
        </xs:sequence>
      </xs:complexType>
      <xs:complexType name="AdultAge">
        <xs:complexContent>
          <xs:restriction base="AgeBase">
            <xs:sequence>
              <xs:element name="value" type="xs:integer" minOccurs="1"/>
            </xs:sequence>
          </xs:restriction>
        </xs:complexContent>
      </xs:complexType>
    `);
    const xml = `<age xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="AdultAge">
      <value>25</value>
    </age>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(true);
  });

  it("returns DERIVATION_BLOCKED when block='restriction' prevents restriction-based substitution", () => {
    const xsd = makeSchema(`
      <xs:element name="age" type="AgeBase" block="restriction"/>
      <xs:complexType name="AgeBase">
        <xs:sequence>
          <xs:element name="value" type="xs:integer"/>
        </xs:sequence>
      </xs:complexType>
      <xs:complexType name="AdultAge">
        <xs:complexContent>
          <xs:restriction base="AgeBase">
            <xs:sequence>
              <xs:element name="value" type="xs:integer" minOccurs="1"/>
            </xs:sequence>
          </xs:restriction>
        </xs:complexContent>
      </xs:complexType>
    `);
    const xml = `<age xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="AdultAge">
      <value>25</value>
    </age>`;
    const result = checkr.validate(xml, xsd);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DERIVATION_BLOCKED")).toBe(true);
  });
});
