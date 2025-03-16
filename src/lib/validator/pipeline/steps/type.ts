import { NodeValidationStep } from "@lib/types/validation";

/**
 * Type validation step to enforce XSD-defined types and constraints.
 */
export const validateType: NodeValidationStep = (node, schema) => {
    const errors: string[] = [];
    const text = node.textContent?.trim() || "";

    // Skip validation if no type is specified
    if (!schema.type) return errors;

    if (schema.enumeration && schema.enumeration.length > 0) {
        if (!schema.enumeration.includes(text)) {
            errors.push(
                `Element <${schema.name}> must be one of [${schema.enumeration.join(", ")}], but found "${text}".`
            );
        }
    }

    switch (schema.type) {
        case "xs:string":
            break;
        case "xs:integer":
            if (!/^-?\d+$/.test(text)) {
                errors.push(`Element <${schema.name}> must be an integer, but found "${text}".`);
            }
            break;
        case "xs:decimal":
            if (!/^-?\d+(\.\d+)?$/.test(text)) {
                errors.push(`Element <${schema.name}> must be a decimal, but found "${text}".`);
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
            break;
    }

    return errors;
};
