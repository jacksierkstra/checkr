import { Document, Element } from "@xmldom/xmldom";
import {
    ComplexTypeDefinition,
    CompiledSchema,
    ElementDeclaration,
    Particle,
    ParticleTerm,
    QName,
    SimpleTypeDefinition,
    qnameEqual,
    qnameKey,
    displayQName,
} from "@lib/types/component-graph";
import { childElements, locationOf } from "@lib/xml/dom";
import { XMLParser } from "@lib/xml/parser";
import { namespaceKey, NAMESPACE_XML, NAMESPACE_XMLNS, NAMESPACE_XSI } from "@lib/types/namespaces";
import {
    SchemaError,
    SchemaErrorListener,
    SchemaLocation,
    SchemaValidationResult,
} from "@lib/types/schema-error";

export interface ValidateOptions {
    listener?: SchemaErrorListener;
}

export interface InstanceValidator {
    validate(instance: string, schema: CompiledSchema, options?: ValidateOptions): SchemaValidationResult;
}

/**
 * Phase 2 of the two-phase architecture (see docs/adr/architecture-component-model.md §3):
 * walks the instance tree depth-first against an immutable `CompiledSchema`
 * and reports every problem through the error listener / result list.
 *
 * Scope note (CHK-008): content-model matching is implemented for `sequence`
 * model groups with element particles; `choice`/`all` groups, wildcards and
 * nested groups report `UNSUPPORTED_FEATURE` rather than guessing.
 */
export class InstanceValidatorImpl implements InstanceValidator {
    constructor(private xmlParser: XMLParser) {}

    validate(instance: string, schema: CompiledSchema, options: ValidateOptions = {}): SchemaValidationResult {
        const errors: SchemaError[] = [];
        const listener = options.listener;
        const report = (error: SchemaError) => {
            errors.push(error);
            listener?.(error);
        };

        let doc: Document;
        try {
            doc = this.xmlParser.parse(instance);
        } catch {
            report({
                severity: "fatal",
                code: "INVALID_INSTANCE_DOCUMENT",
                message: "The instance document is not well-formed XML.",
                location: { line: 0, column: 0 },
                phase: "instance-validation",
            });
            return { valid: false, errors };
        }

        const root = doc.documentElement;
        if (!root) {
            report({
                severity: "fatal",
                code: "INVALID_INSTANCE_DOCUMENT",
                message: "The instance document has no root element.",
                location: { line: 0, column: 0 },
                phase: "instance-validation",
            });
            return { valid: false, errors };
        }

        const rootQName: QName = { namespaceURI: root.namespaceURI, localName: root.localName ?? "" };
        const decl = schema.grammars.get(namespaceKey(root.namespaceURI))?.elements.get(root.localName ?? "") ?? null;
        if (!decl) {
            report({
                severity: "error",
                code: "UNDECLARED_ELEMENT",
                message: `Element ${displayQName(rootQName)} is not declared as a global element in the schema.`,
                location: locationOf(root),
                phase: "instance-validation",
            });
            return { valid: false, errors };
        }

        this.validateElement(root, decl, schema, report);
        const valid = !errors.some((e) => e.severity === "error" || e.severity === "fatal");
        return { valid, errors };
    }

    // -----------------------------------------------------------------------
    // Element / type validation
    // -----------------------------------------------------------------------

    private validateElement(
        node: Element,
        decl: ElementDeclaration,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): void {
        const type = decl.type;
        if (!type) return; // untyped element behaves as xs:anyType for now (CHK-023).

        if (type.kind === "simple-type") {
            this.validateSimpleContent(node, type, report);
            return;
        }
        this.validateComplex(node, type, schema, report);
    }

    private validateSimpleContent(
        node: Element,
        _type: SimpleTypeDefinition,
        report: (error: SchemaError) => void
    ): void {
        // Lexical validation of simple values is the facet framework's work (CHK-010..CHK-014).
        const elementChildren = childElements(node);
        if (elementChildren.length > 0) {
            report(this.error(node, "INVALID_ELEMENT_CONTENT",
                `Element <${node.localName}> has child elements but its simple type does not allow element content.`));
        }
    }

    private validateComplex(
        node: Element,
        type: ComplexTypeDefinition,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): void {
        const elementChildren = childElements(node);
        const text = this.nonWhitespaceText(node);

        switch (type.contentType) {
            case "simple":
                if (elementChildren.length > 0) {
                    report(this.error(node, "INVALID_ELEMENT_CONTENT",
                        `Element <${node.localName}> has child elements but its type has simple content.`));
                }
                break;
            case "empty":
                if (elementChildren.length > 0) {
                    report(this.error(node, "INVALID_ELEMENT_CONTENT",
                        `Element <${node.localName}> has child elements but its type has empty content.`));
                }
                if (text) {
                    report(this.error(node, "UNEXPECTED_TEXT_CONTENT",
                        `Element <${node.localName}> has text content but its type has empty content.`));
                }
                break;
            case "element-only":
                if (text) {
                    report(this.error(node, "UNEXPECTED_TEXT_CONTENT",
                        `Element <${node.localName}> has character data but its type is element-only.`));
                }
                if (type.particle) this.validateParticle(node, elementChildren, type.particle, schema, report);
                break;
            case "mixed":
                if (type.particle) this.validateParticle(node, elementChildren, type.particle, schema, report);
                break;
        }

        this.validateAttributes(node, type, report);
    }

    // -----------------------------------------------------------------------
    // Content model
    // -----------------------------------------------------------------------

    private validateParticle(
        node: Element,
        children: Element[],
        particle: Particle,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): void {
        const term = particle.term;
        if (term.kind === "wildcard") {
            report(this.error(node, "UNSUPPORTED_FEATURE",
                "Wildcard content (xs:any) is compiled but not validated yet."));
            return;
        }
        if (term.kind === "element") {
            this.validateSequence(node, children, [particle], schema, report);
            return;
        }
        // Model group
        if (term.kind === "sequence") {
            this.validateSequence(node, children, term.particles, schema, report);
            return;
        }
        report(this.error(node, "UNSUPPORTED_FEATURE",
            `The ${term.kind} content model is not validated yet (CHK-018).`));
    }

    /**
     * Greedy sequence matching: walk the instance children in order, consuming
     * each particle up to its maxOccurs, then flag unsatisfied minOccurs and
     * leftover children. Greedy, not lookahead-based — a child that matches a
     * later particle after an out-of-order sibling is reported both as missing
     * and unexpected. Proper content-model validation is CHK-018.
     */
    private validateSequence(
        node: Element,
        children: Element[],
        particles: ReadonlyArray<Particle>,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): void {
        let idx = 0;
        for (const particle of particles) {
            let count = 0;
            while (idx < children.length) {
                const child = children[idx];
                if (!this.matches(child, particle.term)) break;
                count++;
                idx++;
                const term = particle.term;
                if (term.kind === "element") {
                    this.validateElement(child, term, schema, report);
                } else {
                    report(this.error(node, "UNSUPPORTED_FEATURE",
                        "Nested model groups are not validated yet (CHK-018)."));
                }
                if (particle.maxOccurs !== "unbounded" && count >= particle.maxOccurs) break;
            }
            if (count < particle.minOccurs) {
                const termName = this.termName(particle.term);
                report(this.error(node, "MISSING_REQUIRED_ELEMENT",
                    `Element ${termName} must occur at least ${particle.minOccurs} time(s) inside <${node.localName}>, but occurs ${count}.`));
            }
        }
        while (idx < children.length) {
            const child = children[idx];
            report(this.error(child, "UNEXPECTED_ELEMENT",
                `Element <${child.localName}> is not allowed inside <${node.localName}> at this position.`));
            idx++;
        }
    }

    private matches(child: Element, term: ParticleTerm): boolean {
        if (term.kind !== "element") return false;
        return qnameEqual(
            { namespaceURI: child.namespaceURI, localName: child.localName ?? "" },
            term.name
        );
    }

    private termName(term: ParticleTerm): string {
        if (term.kind === "element") return displayQName(term.name);
        return `the ${term.kind} group`;
    }

    // -----------------------------------------------------------------------
    // Attributes
    // -----------------------------------------------------------------------

    private validateAttributes(
        node: Element,
        type: ComplexTypeDefinition,
        report: (error: SchemaError) => void
    ): void {
        const instanceAttrs = Array.from(node.attributes).filter(
            (a) => a.namespaceURI !== NAMESPACE_XMLNS
        );
        const declared = new Set(type.attributeUses.map((use) => qnameKey(use.declaration.name)));

        for (const use of type.attributeUses) {
            const found = instanceAttrs.some((a) =>
                qnameEqual({ namespaceURI: a.namespaceURI, localName: a.localName ?? "" }, use.declaration.name)
            );
            if (!found && use.required) {
                report(this.error(node, "MISSING_REQUIRED_ATTRIBUTE",
                    `Attribute ${displayQName(use.declaration.name)} is required on <${node.localName}> but is missing.`));
            }
        }

        for (const attr of instanceAttrs) {
            const ns = attr.namespaceURI;
            if (ns === NAMESPACE_XML || ns === NAMESPACE_XSI) continue; // xml:*, xsi:* are standard
            const key = qnameKey({ namespaceURI: ns, localName: attr.localName ?? "" });
            if (!declared.has(key)) {
                report(this.error(node, "UNDECLARED_ATTRIBUTE",
                    `Attribute ${displayQName({ namespaceURI: ns, localName: attr.localName ?? "" })} is not declared by the type of <${node.localName}>.`));
            }
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private nonWhitespaceText(node: Element): boolean {
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === 3 || child.nodeType === 4) {
                if (/\S/.test(child.nodeValue ?? "")) return true;
            }
        }
        return false;
    }

    private error(
        node: { lineNumber?: number; columnNumber?: number },
        code: SchemaError["code"],
        message: string
    ): SchemaError {
        return {
            severity: "error",
            code,
            message,
            location: this.location(node),
            phase: "instance-validation",
        };
    }

    private location(node: { lineNumber?: number; columnNumber?: number }): SchemaLocation {
        return locationOf(node);
    }
}