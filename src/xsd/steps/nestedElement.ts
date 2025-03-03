import { XSDElement, XSDChoice } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/steps/pipeline";

export class ParseNestedElementsStep implements PipelineStep<Element, Partial<XSDElement>> {
    execute(el: Element): Partial<XSDElement> {
        const complexTypes = Array.from(el.getElementsByTagName("xs:complexType"));

        const { children, choices } = complexTypes.reduce(
            (acc, ct) => {
                // <xs:sequence> => child elements
                const sequenceEls = Array.from(ct.getElementsByTagName("xs:sequence")).flatMap((seq) =>
                    Array.from(seq.childNodes)
                        .filter((child) => child.nodeType === 1 && child.nodeName === "xs:element")
                        .map((child) => this.parseElement(child as Element))
                        .filter((child): child is XSDElement => child !== null)
                );

                // <xs:choice> => XSDChoice objects
                const choiceArr = Array.from(ct.getElementsByTagName("xs:choice")).map((choiceEl) => ({
                    elements: Array.from(choiceEl.childNodes)
                        .filter((node) => node.nodeType === 1 && node.nodeName === "xs:element")
                        .map((el) => this.parseElement(el as Element))
                        .filter((child): child is XSDElement => child !== null),
                }));

                return {
                    children: [...acc.children, ...sequenceEls],
                    choices: [...acc.choices, ...choiceArr],
                };
            },
            { children: [] as XSDElement[], choices: [] as XSDChoice[] }
        );

        return { children, choices: choices.length > 0 ? choices : undefined };
    }

    private parseElement(el: Element): Partial<XSDElement> {
        const name = el.getAttribute("name");
        if (!name) return {};

        const xsdElem: Partial<XSDElement> = {
            name,
            minOccurs: parseInt(el.getAttribute("minOccurs") || "0", 10),
            maxOccurs: el.getAttribute("maxOccurs") === "unbounded" ? NaN : parseInt(el.getAttribute("maxOccurs") || "1", 10),
        };

        return xsdElem;
    }
}
