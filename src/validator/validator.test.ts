import { Validator, ValidatorImpl } from "@lib/validator/validator";
import { XMLParserImpl } from "@lib/xml/parser";
import { XSDParserImpl } from "@lib/xsd/parser";

describe('Validator', () => {
    let validator: Validator;

    beforeAll(() => {
        const xmlParser = new XMLParserImpl();
        const xsdParser = new XSDParserImpl(xmlParser);
        validator = new ValidatorImpl(xmlParser, xsdParser);
    });

    it('should validate XML according to XSD schema - success case', async () => {
        const xsd = `
          <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
            <xs:element name="Person" type="xs:string" minOccurs="1" maxOccurs="1"/>
          </xs:schema>
        `;
        const xml = `<Person>John Doe</Person>`;
        const result = await validator.validate(xml, xsd);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when required element is missing', async () => {
        const xsd = `
          <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
            <xs:element name="Person" type="xs:string" minOccurs="1" maxOccurs="1"/>
          </xs:schema>
        `;
        const xml = `<NotPerson>Jane Doe</NotPerson>`;
        const result = await validator.validate(xml, xsd);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatch(/Person/);
    });

    it('should validate xs:integer type correctly', async () => {
        const xsd = `
          <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
            <xs:element name="Age" type="xs:integer" minOccurs="1" maxOccurs="1"/>
          </xs:schema>
        `;
        const xmlValid = `<Age>30</Age>`;
        const resultValid = await validator.validate(xmlValid, xsd);
        expect(resultValid.valid).toBe(true);

        const xmlInvalid = `<Age>thirty</Age>`;
        const resultInvalid = await validator.validate(xmlInvalid, xsd);
        expect(resultInvalid.valid).toBe(false);
        expect(resultInvalid.errors[0]).toMatch(/not a valid integer/);
    });

    it('should validate xs:date type correctly', async () => {
        const xsd = `
          <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://example.com/schema">
            <xs:element name="BirthDate" type="xs:date" minOccurs="1" maxOccurs="1"/>
          </xs:schema>
        `;
        const xmlValid = `<BirthDate>1990-05-20</BirthDate>`;
        const resultValid = await validator.validate(xmlValid, xsd);
        expect(resultValid.valid).toBe(true);

        const xmlInvalid = `<BirthDate>May 20, 1990</BirthDate>`;
        const resultInvalid = await validator.validate(xmlInvalid, xsd);
        expect(resultInvalid.valid).toBe(false);
        expect(resultInvalid.errors[0]).toMatch(/not a valid date/);
    });

});