import { NodeValidationStep } from "@lib/types/validation";
import { XSDElement } from "@lib/types/xsd";

export const validateType: NodeValidationStep = (node: Element, schema: XSDElement): string[] => {
    const errors: string[] = [];
    const text = node.textContent?.trim() || "";
    // Example type validation for xs:integer and xs:date.
    switch (schema.type) {
        case 'xs:integer':
            if (!/^-?\d+$/.test(text)) {
                errors.push(`Value "${text}" is not a valid integer.`);
            }
            break;
        case 'xs:date':
            if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                errors.push(`Value "${text}" is not a valid date (YYYY-MM-DD).`);
            }
            break;
        // Add additional type cases as needed.
        default:
            break;
    }
    return errors;
};