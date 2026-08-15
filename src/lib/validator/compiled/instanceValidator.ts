import { Attr, Document, Element } from "@xmldom/xmldom";
import {
    ComplexTypeDefinition,
    CompiledSchema,
    ElementDeclaration,
    Particle,
    ParticleTerm,
    QName,
    SimpleTypeDefinition,
    Wildcard,
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
import { wildcardAllowsNamespace } from "@lib/xsd/wildcards";
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
 * model groups with element particles; `choice`/`all` groups and nested
 * groups report `UNSUPPORTED_FEATURE` rather than guessing. Wildcards are
 * fully validated since CHK-021.
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
                if (type.particle) {
                    this.validateParticle(node, elementChildren, type.particle, schema, report);
                } else if (elementChildren.length > 0) {
                    report(this.error(node, "INVALID_ELEMENT_CONTENT",
                        `Element <${node.localName}> has child elements but its content model is empty.`));
                }
                break;
            case "mixed":
                if (type.particle) {
                    this.validateParticle(node, elementChildren, type.particle, schema, report);
                } else if (elementChildren.length > 0) {
                    // mixed="true" with no compositor: empty particle — character
                    // data only, no element children (CHK-020).
                    report(this.error(node, "INVALID_ELEMENT_CONTENT",
                        `Element <${node.localName}> has child elements but its mixed content model is empty.`));
                }
                break;
        }

        this.validateAttributes(node, type, schema, report);
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

        // Handle occurrence wrapper: repeat the group match per minOccurs/maxOccurs
        if (term.kind === "sequence" || term.kind === "choice" || term.kind === "all") {
            this.validateRepeatingGroup(node, children, particle, schema, report);
            return;
        }

        if (term.kind === "element") {
            // Single element particle: consume matching children, then report leftovers
            const consumed = this.consumeMatchingChildren(node, children, 0, particle, schema, report);
            for (let i = consumed; i < children.length; i++) {
                report(this.error(children[i]!, "UNEXPECTED_ELEMENT",
                    `Element <${children[i]!.localName}> is not allowed inside <${node.localName}> at this position.`));
            }
            return;
        }

        if (term.kind === "wildcard") {
            // Single wildcard particle: consume all children matching the
            // namespace constraint, then report leftovers (CHK-021).
            const consumed = this.consumeMatchingChildren(node, children, 0, particle, schema, report);
            for (let i = consumed; i < children.length; i++) {
                report(this.error(children[i]!, "UNEXPECTED_ELEMENT",
                    `Element <${children[i]!.localName}> is not allowed inside <${node.localName}> at this position.`));
            }
            return;
        }
    }

    /**
     * Handle a particle wrapping a group: apply the particle's minOccurs/maxOccurs
     * to the group match, repeating as needed (greedy).
     *
     * When `reportLeftovers` is true (default, from `validateParticle`), reports
     * remaining unmatched children. When false (from `consumeMatchingChildren`
     * inside a parent sequence), the caller handles leftovers.
     *
     * Returns the number of children consumed (for callers that need it).
     */
    private validateRepeatingGroup(
        node: Element,
        children: Element[],
        particle: Particle,
        schema: CompiledSchema,
        report: (error: SchemaError) => void,
        reportLeftovers = true
    ): number {
        const group = particle.term as { kind: string; particles: ReadonlyArray<Particle> };
        let idx = 0;
        let count = 0;

        // Try at least one occurrence if there are children or the group is required
        while (idx < children.length || (count === 0 && particle.minOccurs > 0)) {
            const groupChildren = children.slice(idx);
            const consumed = this.validateGroupOnce(node, groupChildren, group, schema, report);
            if (consumed === 0 && count > 0) break; // empty repeat — stop
            idx += consumed;
            count++;
            if (consumed === 0) break; // empty match, no more occurrences
            if (particle.maxOccurs !== "unbounded" && count >= particle.maxOccurs) break;
        }

        if (count < particle.minOccurs) {
            report(this.error(node, "MISSING_REQUIRED_ELEMENT",
                `The ${group.kind} group must occur at least ${particle.minOccurs} time(s) inside <${node.localName}>, but occurs ${count}.`));
        }

        // Report remaining unmatched children
        while (reportLeftovers && idx < children.length) {
            report(this.error(children[idx]!, "UNEXPECTED_ELEMENT",
                `Element <${children[idx]!.localName}> is not allowed inside <${node.localName}> at this position.`));
            idx++;
        }
        return idx;
    }

    /**
     * Match a single occurrence of a group against the front of the children array.
     * Returns the number of children consumed.
     */
    private validateGroupOnce(
        node: Element,
        children: Element[],
        group: { kind: string; particles: ReadonlyArray<Particle> },
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): number {
        if (group.kind === "sequence") {
            return this.validateSequenceOnce(node, children, group.particles, schema, report);
        }
        if (group.kind === "choice") {
            return this.validateChoiceOnce(node, children, group.particles, schema, report);
        }
        if (group.kind === "all") {
            return this.validateAllOnce(node, children, group.particles, schema, report);
        }
        return 0;
    }

    /**
     * Greedy sequence matching (one occurrence): consume children matching the
     * sequence particles in order, returns the number of children consumed.
     */
    private validateSequenceOnce(
        node: Element,
        children: Element[],
        particles: ReadonlyArray<Particle>,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): number {
        let idx = 0;
        for (const particle of particles) {
            const consumed = this.consumeMatchingChildren(node, children, idx, particle, schema, report);
            idx += consumed;
            if (consumed === 0 && particle.minOccurs > 0) {
                // Particle couldn't match and is required — stop the sequence
                break;
            }
        }
        return idx;
    }

    /**
     * Consume children starting at `startIdx` that match the given particle.
     * Returns the number of children consumed.
     */
    private consumeMatchingChildren(
        node: Element,
        children: Element[],
        startIdx: number,
        particle: Particle,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): number {
        const term = particle.term;

        // Element term: check if next child matches by name
        if (term.kind === "element") {
            if (startIdx >= children.length) {
                if (particle.minOccurs > 0) {
                    report(this.error(node, "MISSING_REQUIRED_ELEMENT",
                        `Element ${displayQName(term.name)} must occur at least ${particle.minOccurs} time(s) inside <${node.localName}>, but occurs 0.`));
                }
                return 0;
            }
            const child = children[startIdx]!;
            if (!qnameEqual(
                { namespaceURI: child.namespaceURI, localName: child.localName ?? "" },
                term.name
            )) {
                if (particle.minOccurs > 0) {
                    report(this.error(node, "MISSING_REQUIRED_ELEMENT",
                        `Element ${displayQName(term.name)} must occur at least ${particle.minOccurs} time(s) inside <${node.localName}>, but occurs 0.`));
                }
                return 0;
            }
            let count = 0;
            let idx = startIdx;
            while (idx < children.length) {
                const c = children[idx]!;
                if (!qnameEqual(
                    { namespaceURI: c.namespaceURI, localName: c.localName ?? "" },
                    term.name
                )) break;
                count++;
                idx++;
                this.validateElement(c, term, schema, report);
                if (particle.maxOccurs !== "unbounded" && count >= particle.maxOccurs) break;
            }
            return idx - startIdx;
        }

        // Group term: dispatch with occurrence applied (CHK-019).
        // Capture errors in a temp array so that if the group doesn't match
        // (consumed=0) AND is nullable (minOccurs=0), we suppress inner
        // particle errors (e.g. missing required element 'a' inside a group
        // that was never entered). Flush errors only when the group made a
        // match or was required.
        if (term.kind === "sequence" || term.kind === "choice" || term.kind === "all") {
            const tempErrors: SchemaError[] = [];
            const capturingReport = (e: SchemaError) => { tempErrors.push(e); };
            const consumed = this.validateRepeatingGroup(
                node, children.slice(startIdx), particle, schema, capturingReport, false
            );
            if (consumed > 0 || particle.minOccurs > 0) {
                for (const e of tempErrors) report(e);
            }
            return consumed;
        }

        // Wildcard term: consume consecutive children whose namespace matches
        // the constraint, validating each per its processContents (CHK-021).
        if (term.kind === "wildcard") {
            const wildcard = term;
            let count = 0;
            let idx = startIdx;
            while (idx < children.length) {
                const c = children[idx]!;
                if (!wildcardAllowsNamespace(wildcard.namespaceConstraint, c.namespaceURI)) break;
                this.validateWildcardElement(c, wildcard, schema, report);
                count++;
                idx++;
                if (particle.maxOccurs !== "unbounded" && count >= particle.maxOccurs) break;
            }
            if (count < particle.minOccurs) {
                report(this.error(node, "MISSING_REQUIRED_ELEMENT",
                    `A wildcard element must occur at least ${particle.minOccurs} time(s) inside <${node.localName}>, but occurs ${count}.`));
            }
            return idx - startIdx;
        }

        return 0;
    }

    /**
     * Validate an element matched by a wildcard per its `processContents`
     * (XSD 1.0 §3.10.4): strict requires a declaration (and validates against
     * it), lax validates when a declaration exists and skips otherwise, and
     * skip validates nothing (neither the element nor its children/attributes).
     */
    private validateWildcardElement(
        node: Element,
        wildcard: Wildcard,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): void {
        if (wildcard.processContents === "skip") return;
        const decl = this.lookupElementDeclaration(node, schema);
        if (wildcard.processContents === "strict" && !decl) {
            report(this.error(node, "UNDECLARED_ELEMENT",
                `Element <${node.localName}> matches a strict wildcard but has no declaration in the schema.`));
            return;
        }
        if (decl) this.validateElement(node, decl, schema, report);
    }

    /** Resolve an instance element's global declaration by QName. */
    private lookupElementDeclaration(node: Element, schema: CompiledSchema): ElementDeclaration | null {
        return schema.grammars.get(namespaceKey(node.namespaceURI))?.elements.get(node.localName ?? "") ?? null;
    }

    /**
     * Choice semantics (one occurrence): match exactly one alternative.
     * Returns the number of children consumed (0 if none matched, >0 if one matched).
     */
    private validateChoiceOnce(
        node: Element,
        children: Element[],
        particles: ReadonlyArray<Particle>,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): number {
        if (children.length === 0) return 0;

        const firstChild = children[0]!;
        for (const particle of particles) {
            if (!this.matches(firstChild, particle.term)) continue;

            // Found a matching alternative — consume children matching this particle
            const consumed = this.consumeMatchingChildren(node, children, 0, particle, schema, report);
            return consumed;
        }

        // No matching alternative — return 0 without reporting errors
        // The parent (validateRepeatingGroup or validateSequenceOnce) handles leftover reporting.
        return 0;
    }

    /**
     * All-group semantics (one occurrence, XSD 1.0 §3.8.4):
     * unordered, each child particle at most once (maxOccurs=1).
     * Returns the number of children consumed.
     */
    private validateAllOnce(
        node: Element,
        children: Element[],
        particles: ReadonlyArray<Particle>,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): number {
        const matched = new Set<number>();

        for (const particle of particles) {
            const matchingIndices: number[] = [];
            for (let i = 0; i < children.length; i++) {
                if (matched.has(i)) continue;
                if (this.matches(children[i]!, particle.term)) {
                    matchingIndices.push(i);
                }
            }

            if (matchingIndices.length === 0) {
                if (particle.minOccurs > 0) {
                    const termName = this.termName(particle.term);
                    report(this.error(node, "MISSING_REQUIRED_ELEMENT",
                        `Required element ${termName} is missing inside <${node.localName}> (all-group).`));
                }
            } else {
                const max = particle.maxOccurs === "unbounded" ? matchingIndices.length : Math.min(matchingIndices.length, particle.maxOccurs);
                for (let k = 0; k < max; k++) {
                    const idx = matchingIndices[k]!;
                    matched.add(idx);
                    if (particle.term.kind === "element") {
                        this.validateElement(children[idx]!, particle.term, schema, report);
                    } else if (particle.term.kind === "wildcard") {
                        this.validateWildcardElement(children[idx]!, particle.term, schema, report);
                    }
                }
            }
        }

        return matched.size;
    }

    /**
     * Validate the content of a matched child element against a particle.
     * For element particles, validates the element instance.
     * For group particles, dispatches to the appropriate handler.
     */
    private matches(child: Element, term: ParticleTerm): boolean {
        if (term.kind === "element") {
            return qnameEqual(
                { namespaceURI: child.namespaceURI, localName: child.localName ?? "" },
                term.name
            );
        }
        if (term.kind === "sequence" || term.kind === "choice" || term.kind === "all") {
            // For a group term, check if the child matches any of the group's particles
            for (const p of term.particles) {
                if (this.matches(child, p.term)) return true;
            }
            return false;
        }
        if (term.kind === "wildcard") {
            return wildcardAllowsNamespace(term.namespaceConstraint, child.namespaceURI);
        }
        return false;
    }

    private termName(term: ParticleTerm): string {
        if (term.kind === "element") return displayQName(term.name);
        if (term.kind === "wildcard") return "a wildcard";
        return `the ${term.kind} group`;
    }

    // -----------------------------------------------------------------------
    // Attributes
    // -----------------------------------------------------------------------

    private validateAttributes(
        node: Element,
        type: ComplexTypeDefinition,
        schema: CompiledSchema,
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

        const wildcard = type.attributeWildcard;
        for (const attr of instanceAttrs) {
            const ns = attr.namespaceURI;
            if (ns === NAMESPACE_XML || ns === NAMESPACE_XSI) continue; // xml:*, xsi:* are standard
            const key = qnameKey({ namespaceURI: ns, localName: attr.localName ?? "" });
            if (declared.has(key)) continue;
            if (wildcard && wildcardAllowsNamespace(wildcard.namespaceConstraint, ns)) {
                // Attribute wildcard match: validate per processContents (CHK-021).
                this.validateWildcardAttribute(node, attr, wildcard, schema, report);
                continue;
            }
            report(this.error(node, "UNDECLARED_ATTRIBUTE",
                `Attribute ${displayQName({ namespaceURI: ns, localName: attr.localName ?? "" })} is not declared by the type of <${node.localName}>.`));
        }
    }

    /**
     * Validate an attribute matched by an attribute wildcard per its
     * `processContents`: strict requires a declaration and validates the value
     * against it, lax validates when a declaration exists and skips otherwise,
     * and skip validates nothing.
     */
    private validateWildcardAttribute(
        node: Element,
        attr: Attr,
        wildcard: Wildcard,
        schema: CompiledSchema,
        report: (error: SchemaError) => void
    ): void {
        if (wildcard.processContents === "skip") return;
        const decl = schema.grammars.get(namespaceKey(attr.namespaceURI))?.attributes.get(attr.localName ?? "") ?? null;
        if (wildcard.processContents === "strict" && !decl) {
            report(this.error(node, "UNDECLARED_ATTRIBUTE",
                `Attribute ${displayQName({ namespaceURI: attr.namespaceURI, localName: attr.localName ?? "" })} matches a strict attribute wildcard but has no declaration in the schema.`));
            return;
        }
        if (decl?.type) {
            this.validateTextValue(node, attr.value ?? "", decl.type, report);
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