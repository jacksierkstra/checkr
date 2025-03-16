import { DOMParser, DOMParserOptions as Options  } from '@xmldom/xmldom';
import { XMLDocument } from '@lib/types/xml'; 
export interface XMLParser {
    parse(xml: string): XMLDocument;
}

export class XMLParserImpl implements XMLParser {

    parse(xml: string): XMLDocument {
        const mimeType = 'application/xml';
        const options: Options = {
            onError: (msg) => this.throw(msg)
        };
        const parser = new DOMParser(options);
        return parser.parseFromString(xml.trim(), mimeType);
    }

    private throw(msg: string) {
        throw new Error(msg);
    };

}