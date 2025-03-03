import { ValidationResult } from "@lib/types/validation";
import { Validator, ValidatorImpl } from "@lib/validator/validator";
import { XMLParser, XMLParserImpl } from "@lib/xml/parser";
import { XSDParser } from "@lib/xsd/parser";
import { XSDStandardParserImpl } from "@lib/xsd/standard";

export class Checkr {

    private xmlParser: XMLParser;
    private xsdParser: XSDParser;
    private validator: Validator;

    constructor() {
        this.xmlParser = new XMLParserImpl();
        this.xsdParser = new XSDStandardParserImpl(this.xmlParser);
        this.validator = new ValidatorImpl(this.xmlParser, this.xsdParser);
    }

    public validate(xml: string, xsd: string): Promise<ValidationResult> {
        return this.validator.validate(xml, xsd);
    }

}