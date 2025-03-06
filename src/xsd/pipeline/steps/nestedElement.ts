import { XSDElement, XSDChoice } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

export class ParseNestedElementsStep implements PipelineStep<Element, Partial<XSDElement>> {
    execute(el: Element): Partial<XSDElement> {
        const complexTypes = Array.from(el.getElementsByTagName("xs:complexType"));
    
        const { children, choices } = complexTypes.reduce(
            (acc, ct) => {
                const sequenceEls = this.getChildElements(ct, "xs:sequence").flatMap(seq =>
                    this.getChildElements(seq).map(child => this.parseElement(child)).filter((child): child is XSDElement => !!child)
                );
    
                const choiceArr = this.getChildElements(ct, "xs:choice").map(choiceEl => ({
                    elements: this.getChildElements(choiceEl).map(el => this.parseElement(el)).filter((child): child is XSDElement => !!child),
                })).filter(choice => choice.elements.length > 0);
    
                const directChildren = this.getChildElements(ct).map(el => this.parseElement(el)).filter((child): child is XSDElement => !!child);
    
                return {
                    children: [...acc.children, ...sequenceEls, ...directChildren],
                    choices: [...acc.choices, ...choiceArr],
                };
            },
            { children: [] as XSDElement[], choices: [] as XSDChoice[] }
        );
    
        return { children, choices: choices.length > 0 ? choices : undefined };
    }

    private getChildElements(parent: Element, tagName?: string): Element[] {
        let nodeList: HTMLCollectionOf<Element>; // Change the type here
        if (tagName) {
            nodeList = parent.getElementsByTagName(tagName);
        } else {
            nodeList = parent.childNodes as any;
        }
        return Array.from(nodeList).flatMap(el => {
            if (el.nodeType === 1 && el.nodeName === "xs:element") {
                return [el]
            } else if (el.nodeType === 3 && el.textContent?.trim() === "") {
                return [];
            } else if (el.nodeType === 1) {
                return [el];
            } else {
                return [];
            }
        });
    }

    private parseElement(el: Element): XSDElement | null {
        const name = el.getAttribute("name");
        if (!name) return null;

        return {
            name,
            minOccurs: parseInt(el.getAttribute("minOccurs") ?? "0", 10),
            maxOccurs: el.getAttribute("maxOccurs") === "unbounded" ? NaN : parseInt(el.getAttribute("maxOccurs") ?? "1", 10),
        };
    }
}
