import { XSDAttribute, XSDChoice, XSDElement, XSDSchema } from "@lib/types/xsd";
import { XMLParser } from "@lib/xml/parser";
import { XSDParser } from "@lib/xsd/parser";

export class XSDStandardParserImpl implements XSDParser {
    constructor(private xmlParser: XMLParser) { }

    async parse(xsd: string): Promise<XSDSchema> {
        const doc = this.xmlParser.parse(xsd);

        // Ensure documentElement is valid
        if (!doc.documentElement || doc.documentElement.tagName !== "xs:schema") {
            throw new Error("Invalid XSD: Missing root <xs:schema>");
        }

        return {
            targetNamespace: doc.documentElement.getAttribute("targetNamespace") || undefined,
            elements: Array.from(doc.documentElement.childNodes)
                .filter((node) => node.nodeType === 1 && node.nodeName === "xs:element")
                .map((el) => this.parseElement(el as Element))
                .filter((element): element is XSDElement => element !== null),
        };
    }

    private parseElement = (el: Element): XSDElement | null => {
        const name = el.getAttribute("name");
        if (!name) return null;

        const simpleType = el.getElementsByTagName("xs:simpleType")[0];
        const enumeration = this.parseEnumeration(simpleType);

        const xsdElem: XSDElement = {
            name,
            type: el.getAttribute("type") || undefined,
            minOccurs: parseInt(el.getAttribute("minOccurs") || "0", 10),
            maxOccurs: el.getAttribute("maxOccurs") === "unbounded" ? NaN : parseInt(el.getAttribute("maxOccurs") || "1", 10),
            attributes: this.parseAttributes(el),
            enumeration,
            children: [],
        };

        const { children, choices } = this.parseNestedElements(el);
        xsdElem.children = children;
        if (choices.length > 0) {
            xsdElem.choices = choices;
        }

        // Now handle <xs:simpleType> -> <xs:restriction>
        if (simpleType) {
            const restriction = simpleType.getElementsByTagName("xs:restriction")[0];
            if (restriction) {
                // 1) parse the restrictions
                const partial = this.parseSimpleRestrictions(restriction);

                // 2) merge them into xsdElem
                Object.assign(xsdElem, partial);
            }
        }

        return xsdElem;
    };

    private parseEnumeration(simpleTypeEl?: Element): string[] | undefined {
        if (!simpleTypeEl) return undefined;

        const restriction = simpleTypeEl.getElementsByTagName("xs:restriction")[0];
        if (!restriction) return undefined;

        const enumNodes = restriction.getElementsByTagName("xs:enumeration");
        const enumeration = Array.from(enumNodes).map(
            (enumNode) => enumNode.getAttribute("value") || ""
        );
        return enumeration.length > 0 ? enumeration : undefined;
    }

    private parseAttributes = (el: Element): XSDAttribute[] =>
        Array.from(el.getElementsByTagName("xs:attribute")).map((attr) => ({
            name: attr.getAttribute("name")!,
            type: attr.getAttribute("type") || "xs:string",
            use: (attr.getAttribute("use") as "required" | "optional") || "optional",
            fixed: attr.getAttribute("fixed") || undefined,
        }));

    private parseNestedElements(el: Element): { children: XSDElement[]; choices: XSDChoice[] } {
        const complexTypes = Array.from(el.getElementsByTagName("xs:complexType"));

        return complexTypes.reduce(
            (acc, ct) => {
                // <xs:sequence> => child elements
                const sequenceEls = Array.from(ct.getElementsByTagName("xs:sequence")).flatMap((seq) =>
                    Array.from(seq.childNodes)
                        .filter((child) => child.nodeType === 1 && child.nodeName === "xs:element")
                        .map((child) => this.parseElement(child as Element))
                        .filter((child): child is XSDElement => child !== null)
                );

                // <xs:choice> => XSDChoice objects
                const choiceArr = Array.from(ct.getElementsByTagName("xs:choice")).map((choiceEl) =>
                    this.parseChoice(choiceEl)
                );

                // Accumulate in our aggregator
                return {
                    children: [...acc.children, ...sequenceEls],
                    choices: [...acc.choices, ...choiceArr],
                };
            },
            { children: [] as XSDElement[], choices: [] as XSDChoice[] }
        );
    }

    private parseChoice(choiceEl: Element): XSDChoice {
        const elementNodes = Array.from(choiceEl.childNodes).filter(
            (node) => node.nodeType === 1 && node.nodeName === "xs:element"
        ) as Element[];

        const elements = elementNodes
            .map((el) => this.parseElement(el))
            .filter((child): child is XSDElement => child !== null);

        return { elements };
    }

    private parseSimpleRestrictions(restriction: Element): Partial<XSDElement> {
        const result: Partial<XSDElement> = {};

        // If the base indicates an XSD type, set that as our element's type
        const baseType = restriction.getAttribute("base");
        if (baseType && baseType.startsWith("xs:")) {
            result.type = baseType; // e.g. "xs:string", "xs:integer"
        }

        // enumerations
        const enumNodes = restriction.getElementsByTagName("xs:enumeration");
        const enumeration = Array.from(enumNodes).map(
            (enumNode) => enumNode.getAttribute("value") || ""
        );
        if (enumeration.length > 0) {
            result.enumeration = enumeration;
        }

        // pattern
        const patternEl = restriction.getElementsByTagName("xs:pattern")[0];
        if (patternEl) {
            const regex = patternEl.getAttribute("value");
            if (regex) {
                result.pattern = regex;
            }
        }

        // minLength
        const minLenEl = restriction.getElementsByTagName("xs:minLength")[0];
        if (minLenEl) {
            const val = parseInt(minLenEl.getAttribute("value") || "", 10);
            if (!isNaN(val)) {
                result.minLength = val;
            }
        }

        // maxLength
        const maxLenEl = restriction.getElementsByTagName("xs:maxLength")[0];
        if (maxLenEl) {
            const val = parseInt(maxLenEl.getAttribute("value") || "", 10);
            if (!isNaN(val)) {
                result.maxLength = val;
            }
        }

        return result;
    }


}