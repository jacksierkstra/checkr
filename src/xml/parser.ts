import { DOMParser, Options } from 'xmldom';

export interface XMLParser {
    parse(xml: string): XMLDocument;
}

export class XMLParserImpl implements XMLParser {

    parse(xml: string): XMLDocument {
        const options: Options = {
            errorHandler: {
                warning: (msg) => this.throw(msg),
                error: (msg) => this.throw(msg),
                fatalError: (msg) => this.throw(msg),
            },
        };
        return new DOMParser(options).parseFromString(xml, 'application/xml');
    }

    private throw(msg: string) {
        throw new Error(msg);
    };

}