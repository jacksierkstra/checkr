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
import { validateAbstract } from "@lib/validator/pipeline/steps/abstract";
import { validateRootElements } from "@lib/validator/pipeline/steps/rootElements";
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
            .addStep(validateAbstract)  // Check for abstract elements first
            .addStep(validateType)
            .addStep(validateAttributes)
            .addStep(validateConstraints)
            .addStep(validateRequiredChildren);

        // Global pipeline (occurrence checks, etc.)
        this.globalPipeline = new GlobalValidationPipelineImpl()
            .addStep(validateOccurrence);
    }

    private validateElements(xmlDoc: XMLDocument, elements: XSDElement[]): string[] {
        const errors: string[] = [];
        
        for (const schemaElement of elements) {
            // Find all nodes matching this element
            const nodes = Array.from(
                schemaElement.namespace 
                    ? xmlDoc.getElementsByTagNameNS(schemaElement.namespace || null, schemaElement.name) 
                    : xmlDoc.getElementsByTagName(schemaElement.name)
            );
            
            // Global checks (e.g., occurrence constraints) for this element
            const globalErrors = this.globalPipeline.execute(nodes, schemaElement);
            errors.push(...globalErrors);

            // Node-level checks for each instance of this element
            for (const node of nodes) {
                const nodeErrors = this.validateNode(node, schemaElement);
                errors.push(...nodeErrors);
            }
        }
        
        return errors;
    }


    private validateNode(node: Element, schemaElement: XSDElement): string[] {
        const errors: string[] = [];
    
        // Node-level validation pipeline
        errors.push(...this.nodePipeline.execute(node, schemaElement));
    
        // If choices exist, validate them
        if (schemaElement.choices && schemaElement.choices.length > 0) {
            // For simplicity, assume 1 XSDChoice
            const [choiceDef] = schemaElement.choices;
            errors.push(...this.validateChoice(node, choiceDef));
        }
    
        // Recursively validate direct children only if they exist in the XML
        // The requiredChildren validation step already handles missing required children
        if (schemaElement.children && schemaElement.children.length > 0) {
            const childrenErrors = schemaElement.children.flatMap((childSchema) => {
                const childNodes = node.hasChildNodes() ? Array.from(node.childNodes) : [];
                const filtered = childNodes
                    .filter((child): child is Element => child.nodeType === 1)
                    .filter((child) => {
                        // Match by tagName or localName (case-insensitive)
                        const childName = child.tagName || child.localName;
                        return childName && childName.toLowerCase() === childSchema.name.toLowerCase();
                    });
            
                // Only validate children that exist in the document
                // Missing required children are handled by validateRequiredChildren
                return filtered.length > 0 ? [
                    ...this.globalPipeline.execute(filtered, childSchema),
                    ...filtered.flatMap((childNode) => this.validateNode(childNode, childSchema)),
                ] : [];
            });
            
            errors.push(...childrenErrors);
        }
    
        return errors;
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
        try {
            const schema: XSDSchema = await this.xsdParser.parse(xsd);
            const xmlDoc = this.xmlParser.parse(xml);

            // First check if all required root elements are present
            const rootElementErrors = validateRootElements(xmlDoc, schema);
            
            // Then validate the elements that are present
            const elementErrors = this.validateElements(xmlDoc, schema.elements);
            
            // Combine all errors
            const errors = [...rootElementErrors, ...elementErrors];
            
            // Always report validation status correctly based on errors
            return { 
                valid: errors.length === 0, 
                errors 
            };
        } catch (error) {
            // Handle any parsing errors or other exceptions
            return { 
                valid: false, 
                errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`] 
            };
        }
    }
}
