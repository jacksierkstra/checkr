import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { ParseTypeReferencesStep } from "@lib/xsd/pipeline/steps/typeReferences";

describe('ResolveTypeReferencesStep', () => {

    const schema: XSDSchema = {
        elements: [
            {
                name: "SimpleType",
                children: [
                    { name: "foo", type: "xsd:string" },
                    { name: "bar", type: "xsd:string" }
                ]
            }
        ]
    };

    it('should resolve children from a referenced type', () => {
        const rootElement: XSDElement = {
            name: "root",
            type: "SimpleType"
        };

        const step = new ParseTypeReferencesStep(schema);
        const resolved = step.execute(rootElement);

        expect(resolved.children).toBeDefined();
        expect(resolved.children).toHaveLength(2);
        expect(resolved.children).toEqual([
            { name: "foo", type: "xsd:string" },
            { name: "bar", type: "xsd:string" }
        ]);
    });

    it('should return element as is if type is not found', () => {
        const rootElement: XSDElement = {
            name: "root",
            type: "UnknownType"
        };

        const step = new ParseTypeReferencesStep(schema);
        const resolved = step.execute(rootElement);

        expect(resolved.children).toBeUndefined();
    });

    it('should return element as is if no type is specified', () => {
        const rootElement: XSDElement = {
            name: "root"
        };

        const step = new ParseTypeReferencesStep(schema);
        const resolved = step.execute(rootElement);

        expect(resolved.children).toBeUndefined();
    });

    it('should not overwrite existing children if type has no children', () => {
        const schemaWithEmptyType: XSDSchema = {
            elements: [
                { name: "EmptyType" } // no children
            ]
        };

        const rootElement: XSDElement = {
            name: "root",
            type: "EmptyType",
            children: [{ name: "existing", type: "xsd:string" }]
        };

        const step = new ParseTypeReferencesStep(schemaWithEmptyType);
        const resolved = step.execute(rootElement);

        expect(resolved.children).toEqual([{ name: "existing", type: "xsd:string" }]);
    });
});
