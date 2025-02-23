import { XSDSchema } from "@lib/types/xsd";

export interface WSDLDefinition {
    types: WSDLTypes;
    interfaces: WSDLInterface[];
    bindings: WSDLBinding[];
    services: WSDLService[];
    // Add other relevant WSDL elements
}

export interface WSDLTypes {
    schemas: XSDSchema[];
}

export interface WSDLInterface {
    name: string;
    operations: WSDLOperation[];
}

export interface WSDLOperation {
    name: string;
    pattern: string;
    input: WSDLMessageRef;
    output: WSDLMessageRef;
}

export interface WSDLMessageRef {
    element: string; // Qualified name (e.g., tns:request)
}

export interface WSDLBinding {
    name: string;
    interface: string; // Qualified name (e.g., tns:MyService)
    type: string;
    version: string;
    operations: WSDLBindingOperation[];
}

export interface WSDLBindingOperation {
    ref: string; // Qualified name (e.g., tns:myOperation)
    soapAction: string;
}

export interface WSDLService {
    name: string;
    interface: string; // Qualified name (e.g., tns:MyService)
    endpoints: WSDLEndpoint[];
}

export interface WSDLEndpoint {
    name: string;
    binding: string; // Qualified name (e.g., tns:MyServiceBinding)
    address: string;
}