import { XSDSchema } from "@lib/types/xsd";

export interface XSDParser {
  parse(xsd: string): Promise<XSDSchema>;
}
