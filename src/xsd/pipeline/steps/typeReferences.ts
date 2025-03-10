import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

export class ParseTypeReferencesStep implements PipelineStep<XSDElement, XSDElement> {

    constructor(private schema: XSDSchema) {}

    execute(el: XSDElement): XSDElement {
        if (!el.type) {
            // No type to resolve, return as is
            return el;
        }

        // Find matching type definition in schema.elements
        const typeDef = this.schema.elements.find(e => e.name === el.type);

        if (!typeDef) {
            return el; // Or throw an error for strict behavior
        }

        // Merge the type definition's children and choices into the element.
        // If the type definition provides children or choices, use them.
        return {
            ...el,
            children: typeDef.children && typeDef.children.length > 0
                ? typeDef.children
                : el.children,
            choices: typeDef.choices && typeDef.choices.length > 0
                ? typeDef.choices
                : el.choices
        };
    }
}
