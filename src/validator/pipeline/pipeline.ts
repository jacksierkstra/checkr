import { XSDElement } from '@lib/types/xsd';

export abstract class AbstractPipeline<TInput, TStep> {
  protected steps: TStep[] = [];

  addStep(step: TStep): this {
    this.steps.push(step);
    return this;
  }

  setSteps(steps: TStep[]): this {
    this.steps = steps;
    return this;
  }

  abstract execute(input: TInput, schema: XSDElement): string[];
}
