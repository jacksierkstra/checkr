import { XSDElement } from "@lib/types/xsd";
import { GlobalValidationPipelineImpl } from "@lib/validator/pipeline/global";
import { GlobalValidationStep, ValidationError } from "@lib/types/validation";

describe("GlobalValidationPipelineImpl", () => {
  const schema: XSDElement = { name: "Root" };
  const nodes: Element[] = [];

  it("returns empty array when no steps are registered", () => {
    const pipeline = new GlobalValidationPipelineImpl();
    expect(pipeline.execute(nodes, schema)).toEqual([]);
  });

  it("runs a single step and returns its errors", () => {
    const error: ValidationError = { code: "MISSING_REQUIRED_ELEMENT", message: "Missing", element: "Child" };
    const step: GlobalValidationStep = () => [error];
    const pipeline = new GlobalValidationPipelineImpl();
    pipeline.addStep(step);
    expect(pipeline.execute(nodes, schema)).toEqual([error]);
  });

  it("aggregates errors from multiple steps", () => {
    const err1: ValidationError = { code: "MISSING_REQUIRED_ELEMENT", message: "Error 1" };
    const err2: ValidationError = { code: "UNEXPECTED_ELEMENT", message: "Error 2" };
    const step1: GlobalValidationStep = () => [err1];
    const step2: GlobalValidationStep = () => [err2];
    const pipeline = new GlobalValidationPipelineImpl();
    pipeline.addStep(step1).addStep(step2);
    const errors = pipeline.execute(nodes, schema);
    expect(errors).toHaveLength(2);
    expect(errors).toContainEqual(err1);
    expect(errors).toContainEqual(err2);
  });

  it("returns empty array when all steps return no errors", () => {
    const step: GlobalValidationStep = () => [];
    const pipeline = new GlobalValidationPipelineImpl();
    pipeline.addStep(step);
    expect(pipeline.execute(nodes, schema)).toEqual([]);
  });

  it("replaces all steps when setSteps is called", () => {
    const oldStep: GlobalValidationStep = () => [{ code: "UNEXPECTED_ELEMENT", message: "Old" }];
    const newStep: GlobalValidationStep = () => [];
    const pipeline = new GlobalValidationPipelineImpl();
    pipeline.addStep(oldStep);
    pipeline.setSteps([newStep]);
    expect(pipeline.execute(nodes, schema)).toEqual([]);
  });

  it("passes nodes and schema to each step", () => {
    const parser = new DOMParser();
    const node = parser.parseFromString("<Item/>", "application/xml").documentElement!;
    const capturedNodes: Element[][] = [];
    const capturedSchemas: XSDElement[] = [];
    const step: GlobalValidationStep = (n, s) => {
      capturedNodes.push(n);
      capturedSchemas.push(s);
      return [];
    };
    const pipeline = new GlobalValidationPipelineImpl();
    pipeline.addStep(step);
    pipeline.execute([node], schema);
    expect(capturedNodes[0]).toContain(node);
    expect(capturedSchemas[0]).toBe(schema);
  });
});
