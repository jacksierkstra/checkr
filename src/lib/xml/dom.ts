import { Element } from "@xmldom/xmldom";
import type { SchemaLocation } from "@lib/types/schema-error";

/** Filter child nodes to element nodes only. */
export function childElements(node: Element): Element[] {
    return Array.from(node.childNodes).filter((c): c is Element => c.nodeType === 1);
}

/** Build a `SchemaLocation` from a DOM node that carries line/column information. */
export function locationOf(node: {
    lineNumber?: number;
    columnNumber?: number;
}): SchemaLocation {
    return { line: node.lineNumber ?? 0, column: node.columnNumber ?? 0 };
}