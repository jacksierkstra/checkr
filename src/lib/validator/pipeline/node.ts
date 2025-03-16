
import { NodeValidationStep } from '@lib/types/validation';
import { XSDElement } from '@lib/types/xsd';
import { AbstractPipeline } from '@lib/validator/pipeline/pipeline';
import { Element } from "@xmldom/xmldom";

export interface NodeValidationPipeline {
    addStep(step: NodeValidationStep): NodeValidationPipeline;
    setSteps(steps: NodeValidationStep[]): NodeValidationPipeline;
    execute(node: Element, schema: XSDElement): string[];
}

export class NodeValidationPipelineImpl extends AbstractPipeline<Element, NodeValidationStep>
    implements NodeValidationPipeline {
    execute(node: Element, schema: XSDElement): string[] {
        return this.steps.reduce<string[]>((errors, step) => {
            return errors.concat(step(node, schema));
        }, []);
    }
}
