import { ValidationResult } from "@lib/types/validation.js";
import { Validator, ValidatorImpl } from "@lib/validator/validator.js";
import { XMLParser, XMLParserImpl } from "@lib/xml/parser.js";
import { XSDParser } from "@lib/xsd/parser.js";
import { XSDPipelineParserImpl } from "@lib/xsd/pipeline/parser.js";

export class Checkr {
  private xmlParser: XMLParser;
  private xsdParser: XSDParser;
  private validator: Validator;

  constructor() {
    this.xmlParser = new XMLParserImpl();
    this.xsdParser = new XSDPipelineParserImpl(this.xmlParser);
    this.validator = new ValidatorImpl(this.xmlParser, this.xsdParser);
  }

  public validate(xml: string, xsd: string): ValidationResult {
    return this.validator.validate(xml, xsd);
  }

  public validateAsync(xml: string, xsd: string): Promise<ValidationResult> {
    return this.validator.validateAsync(xml, xsd);
  }
}
