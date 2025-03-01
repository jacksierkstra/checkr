import { NodeValidationStep } from "@lib/types/validation";
import { XSDElement } from "@lib/types/xsd";
import { NodeValidationPipelineImpl } from "@lib/validator/pipeline/node";

describe('ValidationPipeline', () => {
    let pipeline: NodeValidationPipelineImpl;
    let element: Element;
    let xsdElement: XSDElement;

    beforeEach(() => {
        pipeline = new NodeValidationPipelineImpl();
        element = jest.fn() as unknown as Element;
        xsdElement = jest.fn() as unknown as XSDElement;
    });

    it('should return an empty array when no steps are added', () => {
        const errors = pipeline.execute(element, xsdElement);
        expect(errors).toEqual([]);
    });

    it('should call validation steps in order and collect errors', () => {
        const step1: NodeValidationStep = jest.fn().mockReturnValue(['error1']);
        const step2: NodeValidationStep = jest.fn().mockReturnValue(['error2']);

        pipeline.addStep(step1).addStep(step2);
        const errors = pipeline.execute(element, xsdElement);

        // Verify correct order.
        expect(errors).toEqual(['error1', 'error2']);

        // Verify that each step was called once.
        expect(step1).toHaveBeenCalledTimes(1);
        expect(step1).toHaveBeenCalledWith(element, xsdElement);
        expect(step2).toHaveBeenCalledTimes(1);
        expect(step2).toHaveBeenCalledWith(element, xsdElement);
    });

    it('should call validation steps in different order and collect errors', () => {
        const step1: NodeValidationStep = jest.fn().mockReturnValue(['error1']);
        const step2: NodeValidationStep = jest.fn().mockReturnValue(['error2']);

        pipeline.addStep(step2).addStep(step1);
        const errors = pipeline.execute(element, xsdElement);

        // Verify correct order.
        expect(errors).toEqual(['error2', 'error1']);

        // Verify that each step was called once.
        expect(step2).toHaveBeenCalledTimes(1);
        expect(step2).toHaveBeenCalledWith(element, xsdElement);
        expect(step1).toHaveBeenCalledTimes(1);
        expect(step1).toHaveBeenCalledWith(element, xsdElement);
    });

    it('should override steps when setSteps is called', () => {
        const step1: NodeValidationStep = jest.fn().mockReturnValue(['error1']);
        const step2: NodeValidationStep = jest.fn().mockReturnValue(['error2']);

        // First set the step then override it.
        pipeline.addStep(step1);
        pipeline.setSteps([step2]);

        // Then execute the pipeline.
        const errors = pipeline.execute(element, xsdElement);

        // And verify that the second step was called.
        expect(errors).toEqual(['error2']);
        expect(step1).not.toHaveBeenCalled();
        expect(step2).toHaveBeenCalledTimes(1);
    });

});