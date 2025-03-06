export interface PipelineStep<T, R> {
    execute(input: T): R;
}

export interface Pipeline<T, R> {
    addStep(step: PipelineStep<T, R>): Pipeline<T, R>;
    execute(input: T): R[];
}

export class PipelineImpl<T, R> implements Pipeline<T, R> {
    private steps: PipelineStep<T, R>[] = [];

    addStep(step: PipelineStep<T, R>): Pipeline<T, R> {
        this.steps.push(step);
        return this;
    }

    execute(input: T): R[] {
        return this.steps.flatMap(step => step.execute(input));
    }
}