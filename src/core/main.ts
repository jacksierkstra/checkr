import { ValidationResult } from "@lib/types/validation";
import { Validator, ValidatorImpl } from "@lib/validator/validator";
import { XMLParser, XMLParserImpl } from "@lib/xml/parser";
import { XSDParser, XSDParserImpl } from "@lib/xsd/parser";

export class Checkr {

    private xmlParser: XMLParser;
    private xsdParser: XSDParser;
    private validator: Validator;

    constructor() {
        this.xmlParser = new XMLParserImpl();
        this.xsdParser = new XSDParserImpl(this.xmlParser);
        this.validator = new ValidatorImpl(this.xmlParser, this.xsdParser);
    }

    public validate(xml: string, xsd: string): Promise<ValidationResult> {
        return this.validator.validate(xml, xsd);
    }

}