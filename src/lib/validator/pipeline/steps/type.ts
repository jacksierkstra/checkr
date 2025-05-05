import { NodeValidationStep } from "@lib/types/validation";

/**
 * Type validation step to enforce XSD-defined types and constraints.
 */
export const validateType: NodeValidationStep = (node, schema) => {
    const errors: string[] = [];
    const text = node.textContent?.trim() || "";

    // Skip validation if no type is specified
    if (!schema.type) return errors;

    // Handle enumeration validation
    if (schema.enumeration && schema.enumeration.length > 0) {
        if (!schema.enumeration.includes(text)) {
            errors.push(
                `Element <${schema.name}> must be one of [${schema.enumeration.join(", ")}], but found "${text}".`
            );
        }
    }

    // Handle pattern validation
    if (schema.pattern) {
        try {
            const regex = new RegExp(schema.pattern);
            if (!regex.test(text)) {
                errors.push(
                    `Element <${schema.name}> must match pattern "${schema.pattern}", but found "${text}".`
                );
            }
        } catch (e) {
            // In case of invalid regex pattern, skip validation but log warning
            console.warn(`Invalid pattern "${schema.pattern}" for element <${schema.name}>`);
        }
    }

    // Handle length constraints
    if (schema.minLength !== undefined && text.length < schema.minLength) {
        errors.push(
            `Element <${schema.name}> must have a minimum length of ${schema.minLength}, but found length ${text.length}.`
        );
    }

    if (schema.maxLength !== undefined && text.length > schema.maxLength) {
        errors.push(
            `Element <${schema.name}> must have a maximum length of ${schema.maxLength}, but found length ${text.length}.`
        );
    }

    // Basic type validation based on schema type
    switch (schema.type) {
        case "xs:string":
            break; // Strings accept any value
        case "xs:integer":
            if (!/^-?\d+$/.test(text)) {
                errors.push(`Element <${schema.name}> must be an integer, but found "${text}".`);
            } else {
                // Additional numeric validations if this is an integer
                validateNumericConstraints(parseInt(text, 10), schema, errors);
            }
            break;
        case "xs:decimal":
        case "xs:float":
        case "xs:double":
            if (!/^-?\d+(\.\d+)?$/.test(text)) {
                errors.push(`Element <${schema.name}> must be a decimal number, but found "${text}".`);
            } else {
                // Additional numeric validations if this is a number
                validateNumericConstraints(parseFloat(text), schema, errors);
            }
            break;
        case "xs:boolean":
            if (!["true", "false", "1", "0"].includes(text)) {
                errors.push(`Element <${schema.name}> must be a boolean (true/false/1/0), but found "${text}".`);
            }
            break;
        case "xs:date":
            if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                errors.push(`Element <${schema.name}> must be a valid date (YYYY-MM-DD), but found "${text}".`);
            }
            break;
        default:
            // For non-built-in types, we rely on type resolution to have already happened
            break;
    }

    return errors;
};

/**
 * Helper function to validate numeric constraints like minInclusive, maxInclusive, etc.
 */
function validateNumericConstraints(value: number, schema: any, errors: string[]): void {
    // These constraints would be available if a restriction is resolved onto the schema
    if (schema.minInclusive !== undefined && value < schema.minInclusive) {
        errors.push(
            `Element <${schema.name}> must have a value greater than or equal to ${schema.minInclusive}, but found ${value}.`
        );
    }

    if (schema.maxInclusive !== undefined && value > schema.maxInclusive) {
        errors.push(
            `Element <${schema.name}> must have a value less than or equal to ${schema.maxInclusive}, but found ${value}.`
        );
    }

    if (schema.minExclusive !== undefined && value <= schema.minExclusive) {
        errors.push(
            `Element <${schema.name}> must have a value greater than ${schema.minExclusive}, but found ${value}.`
        );
    }

    if (schema.maxExclusive !== undefined && value >= schema.maxExclusive) {
        errors.push(
            `Element <${schema.name}> must have a value less than ${schema.maxExclusive}, but found ${value}.`
        );
    }
}
