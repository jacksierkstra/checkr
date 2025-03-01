import { NodeValidationStep } from "@lib/types/validation";

/**
 * Checks pattern, minLength, maxLength for string-like values in an element.
 */
export const validateConstraints: NodeValidationStep = (node, schema) => {
    const errors: string[] = [];

    // If there's no pattern/minLength/maxLength, no checks needed
    if (!schema.pattern && schema.minLength == null && schema.maxLength == null) {
        return errors;
    }

    // We only apply this if the type is something like xs:string
    // (or if you want to apply pattern to everything, skip this check)
    if (schema.type !== "xs:string") {
        return errors;
    }

    const text = node.textContent?.trim() || "";

    // Pattern check
    if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(text)) {
            errors.push(
                `Element <${schema.name}> does not match the pattern /${schema.pattern}/, found "${text}".`
            );
        }
    }

    // minLength
    if (schema.minLength != null && text.length < schema.minLength) {
        errors.push(
            `Element <${schema.name}> must be at least length ${schema.minLength}, found length ${text.length}.`
        );
    }

    // maxLength
    if (schema.maxLength != null && text.length > schema.maxLength) {
        errors.push(
            `Element <${schema.name}> must be at most length ${schema.maxLength}, found length ${text.length}.`
        );
    }

    return errors;
};
