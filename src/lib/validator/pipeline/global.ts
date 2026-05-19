import { GlobalValidationStep, ValidationError } from "@lib/types/validation.js";
import { XSDElement } from "@lib/types/xsd.js";
import { AbstractPipeline } from "@lib/validator/pipeline/pipeline.js";

export interface GlobalValidationPipeline {
  addStep(step: GlobalValidationStep): GlobalValidationPipeline;
  setSteps(steps: GlobalValidationStep[]): GlobalValidationPipeline;
  execute(nodes: Element[], schema: XSDElement): ValidationError[];
}

export class GlobalValidationPipelineImpl
  extends AbstractPipeline<Element[], GlobalValidationStep>
  implements GlobalValidationPipeline
{
  execute(nodes: Element[], schema: XSDElement): ValidationError[] {
    return this.steps.reduce<ValidationError[]>((errors, step) => {
      return errors.concat(step(nodes, schema));
    }, []);
  }
}
