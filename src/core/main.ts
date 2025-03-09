import { ValidationResult } from "@lib/types/validation";
import { Validator, ValidatorImpl } from "@lib/validator/validator";
import { XMLParser, XMLParserImpl } from "@lib/xml/parser";
import { XSDParser } from "@lib/xsd/parser";
import { XSDPipelineParserImpl } from "@lib/xsd/pipeline/parser";

export class Checkr {

    private xmlParser: XMLParser;
    private xsdParser: XSDParser;
    private validator: Validator;

    constructor() {
        this.xmlParser = new XMLParserImpl();
        this.xsdParser = new XSDPipelineParserImpl(this.xmlParser);
        this.validator = new ValidatorImpl(this.xmlParser, this.xsdParser);
    }

    public validate(xml: string, xsd: string): Promise<ValidationResult> {
        return this.validator.validate(xml, xsd);
    }

}