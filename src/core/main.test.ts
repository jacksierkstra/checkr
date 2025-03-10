import { Checkr } from "@lib/core/main";

describe('Checkr validation', () => {

    let checkr: Checkr;

    beforeEach(() => {
        checkr = new Checkr();
    });

    describe('Books', () => {

        it('should validate simple valid xsd structure', async () => {
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
            const { valid, errors } = await checkr.validate(xml, xsd);
            expect(valid).toEqual(true);
            expect(errors).toHaveLength(0);
        });

        it('should validate simple invalid xsd structure', async () => {
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
            const { valid, errors } = await checkr.validate(xml, xsd);
            expect(valid).toEqual(false);
            expect(errors).toHaveLength(2);
            expect(errors.at(0)).toEqual('Element <bar> is required inside <root> but is missing.');
            expect(errors.at(1)).toEqual('Element bar occurs 0 times, but should occur at least 1 times.');
        });
    });

});