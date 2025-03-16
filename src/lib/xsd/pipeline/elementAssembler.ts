import { XSDElement } from "@lib/types/xsd";

export class ElementAssembler {

    /**
     * Merge an array of arrays of partial elements into complete XSDElement objects.
     */
    mergePartialElements(partialElements: Partial<XSDElement>[][]): Partial<XSDElement>[] {
        return partialElements.map((partials) =>
            partials.reduce((acc, partial) => ({ ...acc, ...partial }), {})
        );
    }


    /**
     * Filter out any elements that do not have a valid name.
     */
    filterValidElements(elements: Partial<XSDElement>[]): XSDElement[] {
        return elements.filter((element): element is XSDElement => !!element.name);
    }


    /**
     * Recursively apply a namespace to the given elements and their children.
     */
    applyNamespace(elements: XSDElement[], namespace: string): XSDElement[] {
        return elements.map(element => ({
            ...element,
            namespace,
            children: element.children ? this.applyNamespace(element.children, namespace) : undefined,
        }));
    }

}
