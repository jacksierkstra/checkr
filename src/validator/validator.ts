import { ValidationResult } from "@lib/types/validation";
import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { GlobalValidationPipeline, GlobalValidationPipelineImpl } from "@lib/validator/pipeline/global";
import { NodeValidationPipeline, NodeValidationPipelineImpl } from "@lib/validator/pipeline/node";
import { validateAttributes } from "@lib/validator/pipeline/steps/attributes";
import { validateOccurrence } from "@lib/validator/pipeline/steps/occurence";
import { validateType } from "@lib/validator/pipeline/steps/type";
import { XMLParser } from "@lib/xml/parser";
import { XSDParser } from "@lib/xsd/parser";

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
        this.nodePipeline = new NodeValidationPipelineImpl()
            .addStep(validateType)
            .addStep(validateAttributes);
        this.globalPipeline = new GlobalValidationPipelineImpl()
            .addStep(validateOccurrence);
    }

    async validate(xml: string, xsd: string): Promise<ValidationResult> {
        const schema: XSDSchema = await this.xsdParser.parse(xsd);
        const xmlDoc = this.xmlParser.parse(xml);

        const validateElement = (node: Element, schemaElement: XSDElement): string[] => [
            ...this.nodePipeline.execute(node, schemaElement),
            ...(schemaElement.children || []).flatMap((childSchema) => {
                const childNodes = Array.from(node.getElementsByTagName(childSchema.name));
                return [
                    ...this.globalPipeline.execute(childNodes, childSchema),
                    ...childNodes.flatMap((childNode) => validateElement(childNode, childSchema)),
                ];
            }),
        ];

        const errors = schema.elements.flatMap((element) => {
            const nodes = Array.from(xmlDoc.getElementsByTagName(element.name));
            return [
                ...this.globalPipeline.execute(nodes, element),
                ...nodes.flatMap((node) => validateElement(node, element)),
            ];
        });

        return { valid: errors.length === 0, errors };
    }

}
