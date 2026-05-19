import { XSDSchema } from "@lib/types/xsd.js";

export interface XSDParser {
  parse(xsd: string): XSDSchema;
}
