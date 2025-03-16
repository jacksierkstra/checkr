import { ValidationResult } from "@lib/types/validation";
import { XMLDocument } from "@lib/types/xml";
import { XSDChoice, XSDElement, XSDSchema } from "@lib/types/xsd";
import { GlobalValidationPipeline, GlobalValidationPipelineImpl } from "@lib/validator/pipeline/global";
import { NodeValidationPipeline, NodeValidationPipelineImpl } from "@lib/validator/pipeline/node";
import { validateAttributes } from "@lib/validator/pipeline/steps/attributes";
import { validateConstraints } from "@lib/validator/pipeline/steps/constraints";
import { validateOccurrence } from "@lib/validator/pipeline/steps/occurence";
import { validateRequiredChildren } from "@lib/validator/pipeline/steps/requiredChildren";
import { validateType } from "@lib/validator/pipeline/steps/type";
import { XMLParser } from "@lib/xml/parser";
import { XSDParser } from "@lib/xsd/parser";
import { Element } from "@xmldom/xmldom";

export interface Validator {
    validate(xml: string, xsd: string): Promise<ValidationResult>;
}

export class ValidatorImpl implements Validator {
    private nodePipeline: NodeValidationPipeline;
    private globalPipeline: GlobalValidationPipeline;

    constructor(
        private xmlParser: XMLParser,
        private xsdParser: XSDParser
    ) {
        // Node-level pipeline (type checks, attribute checks, etc.)
        this.nodePipeline = new NodeValidationPipelineImpl()
            .addStep(validateType)
            .addStep(validateAttributes)
            .addStep(validateConstraints)
            .addStep(validateRequiredChildren);

        // Global pipeline (occurrence checks, etc.)
        this.globalPipeline = new GlobalValidationPipelineImpl()
            .addStep(validateOccurrence);
    }

    private validateElements(xmlDoc: XMLDocument, elements: XSDElement[]): string[] {
        return elements.flatMap((schemaElement) => {
            const nodes = Array.from(schemaElement.namespace ? xmlDoc.getElementsByTagNameNS(schemaElement.namespace || null, schemaElement.name) : xmlDoc.getElementsByTagName(schemaElement.name));
            
            return [
                // Global checks (e.g., occurrence constraints) for this element
                ...this.globalPipeline.execute(nodes, schemaElement),

                // Node-level checks for each instance of this element
                ...nodes.flatMap((node) => this.validateNode(node, schemaElement)),
            ];
        });
    }

    private validateNode(node: Element, schemaElement: XSDElement): string[] {
        const errors: string[] = [];
    
        // Node-level checks
        errors.push(...this.nodePipeline.execute(node, schemaElement));
    
        // If choices exist, validate them
        if (schemaElement.choices && schemaElement.choices.length > 0) {
            // For simplicity, assume 1 XSDChoice
            const [choiceDef] = schemaElement.choices;
            errors.push(...this.validateChoice(node, choiceDef));
        }
    
        // Recursively validate direct children only
        const childrenErrors = (schemaElement.children || []).flatMap((childSchema) => {

            const childNodes = node.hasChildNodes() ? Array.from(node.childNodes) : [];
            const filtered = childNodes
                .filter((child): child is Element => child.nodeType === 1)
                .filter((child) => child.tagName === childSchema.name);
        
            return [
                ...this.globalPipeline.execute(filtered, childSchema), // This throws an error: Argument of type 'ChildNode[]' is not assignable to parameter of type 'Element[]'.
                ...filtered.flatMap((childNode) => this.validateNode(childNode, childSchema)), // This throws an error: Argument of type 'ChildNode' is not assignable to parameter of type 'Element'.
            ];
        });
    
        return [...errors, ...childrenErrors];
    }
    

    private validateChoice(node: Element, choice: XSDChoice): string[] {
        // Sum how many total child elements from the choice are present
        const matches = choice.elements.reduce((count, el) => {
            return count + node.getElementsByTagName(el.name).length;
        }, 0);

        // If exactly 1 is found, good
        if (matches === 1) return [];

        // Otherwise, produce an error
        return [
            `Choice error: Expected exactly one of [${choice.elements
                .map((x) => x.name)
                .join(", ")}], but found ${matches}.`
        ];
    }

    async validate(xml: string, xsd: string): Promise<ValidationResult> {
        const schema: XSDSchema = await this.xsdParser.parse(xsd);
        const xmlDoc = this.xmlParser.parse(xml);

        const errors = this.validateElements(xmlDoc, schema.elements);
        return { valid: errors.length === 0, errors };
    }
}
