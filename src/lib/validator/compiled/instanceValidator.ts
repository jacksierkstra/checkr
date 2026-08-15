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
import { normalizeWhiteSpace, splitListItems, validateFacets } from "@lib/xsd/facets";
import { checkStringFamilyLexicalSpace } from "@lib/xsd/string-types";
import { checkNumericFamilyLexicalSpace } from "@lib/xsd/numeric-types";
import { checkDateTimeFamilyLexicalSpace } from "@lib/xsd/datetime-types";
import { checkRemainingFamilyLexicalSpace } from "@lib/xsd/remaining-types";
import {
    SchemaError,
    SchemaErrorCode,
    SchemaErrorListener,
    SchemaLocation,
    SchemaValidationResult,
} from "@lib/types/schema-error";

export interface ValidateOptions {
    listener?: SchemaErrorListener;
}

/** A value-space violation produced by simple-type validation (CHK-016). */
interface SimpleValueViolation {
    code: SchemaErrorCode;
    message: string;
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
        type: SimpleTypeDefinition,
        report: (error: SchemaError) => void
    ): void {
        // Reject element children (simple types don't allow element content).
        const elementChildren = childElements(node);
        if (elementChildren.length > 0) {
            report(this.error(node, "INVALID_ELEMENT_CONTENT",
                `Element <${node.localName}> has child elements but its simple type does not allow element content.`));
            return;
        }

        // Validate the text value against the type's facets.
        this.validateTextValue(node, this.textContent(node), type, report);
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
                if (type.simpleType) {
                    this.validateTextValue(node, this.textContent(node), type.simpleType, report);
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
            const attr = instanceAttrs.find((a) =>
                qnameEqual({ namespaceURI: a.namespaceURI, localName: a.localName ?? "" }, use.declaration.name)
            );
            if (!attr) {
                if (use.required) {
                    report(this.error(node, "MISSING_REQUIRED_ATTRIBUTE",
                        `Attribute ${displayQName(use.declaration.name)} is required on <${node.localName}> but is missing.`));
                }
            } else if (use.declaration.type) {
                // Validate attribute value against the declaration's simple type.
                this.validateTextValue(node, attr.value ?? "", use.declaration.type, report);
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
    // Simple-type value validation
    // -----------------------------------------------------------------------

    /**
     * Validate a text value (element text or attribute value) against a simple
     * type: apply the type's whitespace normalization, then check its variety:
     * atomic (lexical space + facets), list (each item against the item type,
     * then whole-form facets), or union (valid if any member type accepts).
     * Returns the violations; the caller reports them through the listener.
     */
    private checkSimpleValue(raw: string, type: SimpleTypeDefinition): SimpleValueViolation[] {
        if (type.variety === "list") return this.checkListValue(raw, type);
        if (type.variety === "union") return this.checkUnionValue(raw, type);
        return this.checkAtomicValue(normalizeWhiteSpace(raw, type.whiteSpace), type);
    }

    /** Atomic variety: built-in lexical space + effective facets (CHK-011..015). */
    private checkAtomicValue(normalized: string, type: SimpleTypeDefinition): SimpleValueViolation[] {
        const out: SimpleValueViolation[] = [];
        const typeName = this.simpleTypeName(type);

        const lexicalError = checkStringFamilyLexicalSpace(normalized, type);
        if (lexicalError !== null) {
            out.push({ code: "LEXICAL_SPACE_VIOLATION", message: `Value '${normalized}' is ${lexicalError} (type ${typeName}).` });
        }

        const numericLexicalError = checkNumericFamilyLexicalSpace(normalized, type);
        if (numericLexicalError !== null) {
            out.push({ code: "LEXICAL_SPACE_VIOLATION", message: `Value '${normalized}' is ${numericLexicalError} (type ${typeName}).` });
        }

        const datetimeLexicalError = checkDateTimeFamilyLexicalSpace(normalized, type);
        if (datetimeLexicalError !== null) {
            out.push({ code: "LEXICAL_SPACE_VIOLATION", message: `Value '${normalized}' is ${datetimeLexicalError} (type ${typeName}).` });
        }

        const remainingLexicalError = checkRemainingFamilyLexicalSpace(normalized, type);
        if (remainingLexicalError !== null) {
            out.push({ code: "LEXICAL_SPACE_VIOLATION", message: `Value '${normalized}' is ${remainingLexicalError} (type ${typeName}).` });
        }

        for (const v of validateFacets(normalized, type.effectiveFacets, type)) {
            out.push({ code: "FACET_VIOLATION", message: `Value '${normalized}' violates ${v.facet} facet of type ${typeName}: ${v.message}` });
        }
        return out;
    }

    /**
     * List variety (XSD 1.0 Part 2 §3.4.1): the list's whiteSpace (collapse)
     * normalizes the whole lexical form; each whitespace-separated item must be
     * valid in the item type; length-family facets count items, pattern and
     * enumeration apply to the whole form.
     */
    private checkListValue(raw: string, type: SimpleTypeDefinition): SimpleValueViolation[] {
        const out: SimpleValueViolation[] = [];
        const normalized = normalizeWhiteSpace(raw, type.whiteSpace);
        const items = splitListItems(normalized);
        const itemType = type.itemTypeDef;

        if (itemType) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i]!;
                for (const v of this.checkSimpleValue(item, itemType)) {
                    out.push({ code: v.code, message: `List item ${i} ('${item}') of type ${this.simpleTypeName(type)}: ${v.message}` });
                }
            }
        }

        const typeName = this.simpleTypeName(type);
        for (const v of validateFacets(normalized, type.effectiveFacets, type)) {
            out.push({ code: "FACET_VIOLATION", message: `Value '${normalized}' violates ${v.facet} facet of type ${typeName}: ${v.message}` });
        }
        return out;
    }

    /**
     * Union variety (XSD 1.0 Part 2 §3.4.2): a value is valid if at least one
     * member type accepts it. The union's own whiteSpace is preserve, so each
     * member applies its own normalization to the raw value. The union's own
     * facets (enumeration/pattern from a restriction) apply to the whole form.
     */
    private checkUnionValue(raw: string, type: SimpleTypeDefinition): SimpleValueViolation[] {
        const out: SimpleValueViolation[] = [];
        const members = type.memberTypeDefs;
        const accepted = members.some((member) => this.checkSimpleValue(raw, member).length === 0);
        if (!accepted) {
            const memberNames = members.length > 0
                ? members.map((m) => this.simpleTypeName(m)).join(", ")
                : "(no member types)";
            out.push({
                code: "UNION_VIOLATION",
                message: `Value '${raw}' is not valid in any member type {${memberNames}} of union ${this.simpleTypeName(type)}.`,
            });
        }

        const normalized = normalizeWhiteSpace(raw, type.whiteSpace);
        const typeName = this.simpleTypeName(type);
        for (const v of validateFacets(normalized, type.effectiveFacets, type)) {
            out.push({ code: "FACET_VIOLATION", message: `Value '${normalized}' violates ${v.facet} facet of type ${typeName}: ${v.message}` });
        }
        return out;
    }

    /** Validate a text value against a simple type and report every violation. */
    private validateTextValue(
        node: Element,
        raw: string,
        type: SimpleTypeDefinition,
        report: (error: SchemaError) => void
    ): void {
        for (const v of this.checkSimpleValue(raw, type)) {
            report(this.error(node, v.code, v.message));
        }
    }

    private simpleTypeName(type: SimpleTypeDefinition): string {
        return displayQName(type.name ?? { namespaceURI: null, localName: "(anonymous)" });
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

    /** Concatenate all text and CDATA node values under `node`. */
    private textContent(node: Element): string {
        let out = "";
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === 3 || child.nodeType === 4) {
                out += child.nodeValue ?? "";
            }
        }
        return out;
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