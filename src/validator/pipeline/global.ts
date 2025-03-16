import { GlobalValidationStep } from '@lib/types/validation';
import { XSDElement } from '@lib/types/xsd';
import { AbstractPipeline } from '@lib/validator/pipeline/pipeline';
import { Element } from "@xmldom/xmldom";

export interface GlobalValidationPipeline {
    addStep(step: GlobalValidationStep): GlobalValidationPipeline;
    setSteps(steps: GlobalValidationStep[]): GlobalValidationPipeline;
    execute(nodes: Element[], schema: XSDElement): string[];
}

export class GlobalValidationPipelineImpl extends AbstractPipeline<Element[], GlobalValidationStep>
    implements GlobalValidationPipeline {
    execute(nodes: Element[], schema: XSDElement): string[] {
        return this.steps.reduce<string[]>((errors, step) => {
            return errors.concat(step(nodes, schema));
        }, []);
    }
}
