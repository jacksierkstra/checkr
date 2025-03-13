import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

export class ParseTypeReferencesStep implements PipelineStep<XSDElement, XSDElement> {

    constructor(private schema: XSDSchema) {}

    execute(el: XSDElement): XSDElement {
        if (!el.type) {
            // No type to resolve, return as is
            return el;
        }

        // Split the type attribute if it contains a colon.
        const parts = el.type.split(":");
        const localTypeName = parts.length > 1 ? parts[1] : parts[0];

        // Optionally, if el.namespace is set, try to match both name and namespace.
        // Otherwise, fall back to just comparing the local name.
        let typeDef = this.schema.elements.find(e => 
            e.name === localTypeName && (el.namespace ? e.namespace === el.namespace : true)
        );

        // If not found using namespace, try to find it by local name only.
        if (!typeDef) {
            typeDef = this.schema.elements.find(e => e.name === localTypeName);
        }

        if (!typeDef) {
            // Optionally, you might want to throw an error or handle this case differently.
            return el;
        }

        // Merge the type definition's children and choices into the element.
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
