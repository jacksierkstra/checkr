import { NodeValidationStep, ValidationError } from "@lib/types/validation.js";
import { XSDElement } from "@lib/types/xsd.js";
import { AbstractPipeline } from "@lib/validator/pipeline/pipeline.js";

export interface NodeValidationPipeline {
  addStep(step: NodeValidationStep): NodeValidationPipeline;
  setSteps(steps: NodeValidationStep[]): NodeValidationPipeline;
  execute(node: Element, schema: XSDElement): ValidationError[];
}

export class NodeValidationPipelineImpl
  extends AbstractPipeline<Element, NodeValidationStep>
  implements NodeValidationPipeline
{
  execute(node: Element, schema: XSDElement): ValidationError[] {
    return this.steps.reduce<ValidationError[]>((errors, step) => {
      return errors.concat(step(node, schema));
    }, []);
  }
}
