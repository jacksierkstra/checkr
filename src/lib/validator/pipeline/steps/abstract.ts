import { NodeValidationStep } from "@lib/types/validation";

/**
 * Validates that abstract elements are not used directly in instance documents
 */
export const validateAbstract: NodeValidationStep = (node, schema) => {
    const errors: string[] = [];

    if (schema.abstract === true) {
        errors.push(
            `Element <${schema.name}> is abstract and cannot be used directly in an instance document.`
        );
    }

    return errors;
};
