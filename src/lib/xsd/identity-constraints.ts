/**
 * Identity-constraint evaluation for XSD 1.0 (CHK-022).
 *
 * Implements the XPath-subset evaluator for selector/field paths
 * (XSD 1.0 Part 1 §3.11.6) and the identity-constraint validation rules
 * (§3.11.4):
 *
 *   - unique:  no two qualified tuple members have pairwise-equal values
 *   - key:     same as unique + every field must have a non-nil value
 *   - keyref:  each qualified tuple must match an entry in the referenced
 *              key/unique's node table
 *
 * The XPath subset follows the spec's grammar:
 *
 *   Selector  ::=  Path ( '|' Path )*
 *   Path      ::=  ('.//')? Step ( '/' Step )*
 *   Step      ::=  '.' | NameTest
 *   NameTest  ::=  QName | '*' | NCName ':' '*'
 *
 * Field paths additionally allow `@NameTest` as the final step.
 *
 * Node tables are built bottom-up: each element's table for a constraint K
 * is the union of (all children's K-tables) + (the element's own qualified
 * K-entries if K is declared on the element). This follows the spec's
 * propagation model (§3.11.5) and lets keyrefs be resolved synchronously.
 */

import { Attr, Element } from "@xmldom/xmldom";
import {
    CompiledPath,
    CompiledSchema,
    CompiledStep,
    ElementDeclaration,
    IdentityConstraintDefinition,
    NameTest,
    SimpleTypeDefinition,
    TypeDefinition,
    displayQName,
} from "@lib/types/component-graph";
import {
    SchemaError,
    SchemaErrorCode,
    SchemaLocation,
} from "@lib/types/schema-error";
import { childElements, locationOf } from "@lib/xml/dom";
import { NAMESPACE_XSD, NAMESPACE_XSI } from "@lib/types/namespaces";
import { normalizeWhiteSpace } from "@lib/xsd/facets";
import { numericValueSpaceOf, parseDecimal, parseFloatingPoint } from "@lib/xsd/numeric-types";

// ---------------------------------------------------------------------------
// Compiled XPath for selector/field
// ---------------------------------------------------------------------------

/**
 * Parse a single Path and resolve prefixes.
 * The `resolvePrefix` callback resolves namespace prefixes from the schema
 * document where the xpath attribute appears.
 */
export function compilePath(
    xpath: string,
    isField: boolean,
    resolvePrefix: (prefix: string) => string | null,
): CompiledPath {
    const path = parsePath(xpath, isField);
    return resolvePathPrefixes(path, resolvePrefix);
}

/**
 * Parse a full Selector expression and resolve prefixes.
 */
export function compileSelector(
    xpath: string,
    resolvePrefix: (prefix: string) => string | null,
): CompiledPath[] {
    return xpath.split("|").map((p) => compilePath(p.trim(), false, resolvePrefix));
}

/**
 * Parse a single Field expression and resolve prefixes.
 */
export function compileField(
    xpath: string,
    resolvePrefix: (prefix: string) => string | null,
): CompiledPath {
    return compilePath(xpath.trim(), true, resolvePrefix);
}

/**
 * Parse a single Path (`('.//')? Step ('/' Step)*` or `('.//')? (Step '/')* (Step | '@' NameTest)`).
 * The `isField` flag controls whether `@NameTest` is allowed as the final step.
 */
function parsePath(xpath: string, isField: boolean): CompiledPath {
    const tokens = tokenize(xpath);
    let pos = 0;

    // A leading '//' (without the '.') is not allowed by the spec grammar —
    // only the './/' descendant-or-self abbreviation is.
    if (pos < tokens.length && tokens[pos] === "//") {
        throw new IdentityPathError(`'${xpath}' is not a valid identity-constraint path: '//' must be written as './/'.`);
    }

    // Optional './/' prefix (self-or-descendant axis)
    let descendant = false;
    if (pos < tokens.length && tokens[pos] === ".") {
        if (pos + 1 < tokens.length && tokens[pos + 1] === "//") {
            descendant = true;
            pos += 2;
        }
    }

    const steps: CompiledStep[] = [];

    // Parse steps separated by '/'
    let first = true;
    while (pos < tokens.length) {
        // Expect a '/' separator between steps (except before the first)
        if (!first) {
            if (tokens[pos] !== "/") {
                throw new IdentityPathError(`'${xpath}' is not a valid identity-constraint path: expected '/' between steps.`);
            }
            pos++;
            if (pos >= tokens.length) {
                throw new IdentityPathError(`'${xpath}' is not a valid identity-constraint path: trailing '/' with no step.`);
            }
        }

        // Check if this is the final step and it's an attribute test (field only)
        if (isField && tokens[pos] === "@") {
            pos++;
            if (pos >= tokens.length) {
                throw new IdentityPathError("'@' at end of field path");
            }
            if (tokens[pos] === "@" || tokens[pos] === "/" || tokens[pos] === "//") {
                throw new IdentityPathError(`'${xpath}' is not a valid identity-constraint path: expected a name test after '@'.`);
            }
            const nameTest = parseNameTest(tokens[pos]!);
            pos++;
            steps.push({ kind: "attribute", nameTest });
            // The attribute test must be the final step
            if (pos < tokens.length) {
                throw new IdentityPathError(`'${xpath}' is not a valid identity-constraint path: an attribute test must be the final step.`);
            }
            break;
        }

        // Parse a step
        const token = tokens[pos]!;
        if (token === ".") {
            steps.push({ kind: "self" });
            pos++;
        } else if (token === "//") {
            throw new IdentityPathError(`'${xpath}' is not a valid identity-constraint path: '//' is only allowed as the './/' prefix.`);
        } else {
            const nameTest = parseNameTest(token);
            steps.push({ kind: "child", nameTest });
            pos++;
        }
        first = false;
    }

    if (steps.length === 0) {
        throw new IdentityPathError(`'${xpath}' is not a valid identity-constraint path: it contains no steps.`);
    }

    return { descendant, steps };
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(xpath: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < xpath.length) {
        if (/\s/.test(xpath[i]!)) {
            i++;
            continue;
        }
        // Handle './/' as '.' then '//'
        if (xpath[i] === "." && i + 1 < xpath.length && xpath[i + 1] === "/" && i + 2 < xpath.length && xpath[i + 2] === "/") {
            tokens.push(".");
            tokens.push("//");
            i += 3;
            continue;
        }
        if (xpath[i] === "/" && i + 1 < xpath.length && xpath[i + 1] === "/") {
            tokens.push("//");
            i += 2;
            continue;
        }
        if (xpath[i] === "." || xpath[i] === "/" || xpath[i] === "@" || xpath[i] === "|") {
            tokens.push(xpath[i]!);
            i++;
            continue;
        }
        let start = i;
        while (i < xpath.length && !/[\s\.\/@\|]/.test(xpath[i]!)) {
            i++;
        }
        tokens.push(xpath.slice(start, i));
    }
    return tokens;
}

function parseNameTest(token: string): NameTest {
    if (token === "*") {
        return { namespace: "*", local: "*" };
    }
    // NameTest must be a QName, '*', or 'NCName:*'. Reject anything else
    // (predicates, functions, axis syntax like 'child::', etc.).
    if (!/^[A-Za-z_][A-Za-z0-9._-]*$/.test(token)) {
        throw new IdentityPathError(`'${token}' is not a valid name test in an identity-constraint XPath.`);
    }
    const colon = token.indexOf(":");
    if (colon === -1) {
        // Unprefixed QName: in XPath 1.0, this matches no-namespace nodes
        return { namespace: null, local: token };
    }
    const prefix = token.slice(0, colon);
    const local = token.slice(colon + 1);
    if (local === "*") {
        return { namespace: prefix, local: "*" };
    }
    if (!/^[A-Za-z_][A-Za-z0-9._-]*$/.test(local)) {
        throw new IdentityPathError(`'${token}' is not a valid name test in an identity-constraint XPath.`);
    }
    return { namespace: prefix, local };
}

/**
 * Resolve namespace prefixes in a compiled path using the given resolver.
 * Called at compile time to replace placeholder prefixes with actual URIs.
 */
function resolvePathPrefixes(
    path: CompiledPath,
    resolvePrefix: (prefix: string) => string | null,
): CompiledPath {
    const steps: Array<{ kind: string; nameTest?: NameTest }> = [];
    for (const step of path.steps) {
        if (step.kind === "self") {
            steps.push({ kind: "self" });
        } else if (step.kind === "child") {
            steps.push({ kind: "child", nameTest: resolveNameTest(step.nameTest, resolvePrefix) });
        } else {
            steps.push({ kind: "attribute", nameTest: resolveNameTest(step.nameTest, resolvePrefix) });
        }
    }
    return { descendant: path.descendant, steps } as CompiledPath;
}

function resolveNameTest(test: NameTest, resolvePrefix: (prefix: string) => string | null): NameTest {
    if (test.namespace === "*" || test.namespace === null) return test;
    if (typeof test.namespace === "string" && !test.namespace.startsWith("http") && !test.namespace.startsWith("{")) {
        const resolved = resolvePrefix(test.namespace);
        if (resolved !== null) {
            return { namespace: resolved, local: test.local };
        }
        return test;
    }
    return test;
}

// ---------------------------------------------------------------------------
// XPath evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a compiled path against a context node.
 * Returns the list of element/attribute nodes selected.
 */
export function evaluatePath(
    path: CompiledPath,
    contextNode: Element,
): (Element | Attr)[] {
    let nodes: (Element | Attr)[] = [contextNode];

    if (path.descendant) {
        const allNodes: (Element | Attr)[] = [];
        for (const n of nodes) {
            if (n.nodeType === 1) {
                allNodes.push(n as Element);
                collectDescendants(n as Element, allNodes);
            }
        }
        nodes = allNodes;
    }

    for (const step of path.steps) {
        const next: (Element | Attr)[] = [];
        for (const n of nodes) {
            if (n.nodeType !== 1) continue;
            const el = n as Element;
            switch (step.kind) {
                case "self":
                    next.push(el);
                    break;
                case "child":
                    for (const child of childElements(el)) {
                        if (matchesNameTest(child, step.nameTest!)) {
                            next.push(child);
                        }
                    }
                    break;
                case "attribute":
                    for (let i = 0; i < el.attributes.length; i++) {
                        const attr = el.attributes[i]!;
                        if (attr.namespaceURI === NAMESPACE_XSI || attr.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
                        if (matchesAttrNameTest(attr, step.nameTest!)) {
                            next.push(attr);
                        }
                    }
                    break;
            }
        }
        nodes = next;
    }
    return nodes;
}

function collectDescendants(el: Element, out: (Element | Attr)[]): void {
    for (const child of childElements(el)) {
        out.push(child);
        collectDescendants(child, out);
    }
}

function matchesNameTest(el: Element, test: NameTest): boolean {
    const ns = el.namespaceURI ?? null;
    if (test.namespace !== "*" && ns !== test.namespace) return false;
    if (test.local !== "*" && el.localName !== test.local) return false;
    return true;
}

function matchesAttrNameTest(attr: Attr, test: NameTest): boolean {
    const ns = attr.namespaceURI ?? null;
    if (test.namespace !== "*" && ns !== test.namespace) return false;
    if (test.local !== "*" && attr.localName !== test.local) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Value-space key computation
// ---------------------------------------------------------------------------

/** A field value: either nil or a string value key for comparison. */
export type FieldValue =
    | { readonly kind: "nil" }
    | { readonly kind: "value"; readonly key: string };

/**
 * Compute the field value for a node based on its type.
 *
 * For a nil field (empty node-set or nilled element) returns nil.
 * For an attribute or simple-typed element, returns the schema-normalized
 * value with a canonical key for value-space comparison.
 */
export function computeFieldValue(
    node: Element | Attr,
    type: TypeDefinition | null | undefined,
    rawValue: string,
): FieldValue {
    // Nilled element: treat as nil
    if (node.nodeType === 1) {
        const el = node as Element;
        const nilAttr = el.getAttributeNS(NAMESPACE_XSI, "nil");
        if (nilAttr === "true") {
            return { kind: "nil" };
        }
    }

    const simpleType = type?.kind === "simple-type" ? type
        : type?.kind === "complex-type" && type.simpleType ? type.simpleType
        : null;

    const ws = simpleType?.whiteSpace ?? "preserve";
    const normalized = normalizeWhiteSpace(rawValue, ws);

    const key = valueSpaceKey(normalized, simpleType);
    return { kind: "value", key };
}

/**
 * Compute a canonical key for value-space comparison.
 * For numeric types, "3.0" and "3" compare equal for decimal.
 * For boolean, "1" and "true" compare equal.
 */
function valueSpaceKey(normalized: string, type: SimpleTypeDefinition | null | undefined): string {
    if (!type) return normalized;

    const family = numericValueSpaceOf(type);
    if (family) {
        return canonicalNumericValue(normalized, family);
    }

    if (type.name && type.name.namespaceURI === NAMESPACE_XSD && type.name.localName === "boolean") {
        return canonicalBooleanValue(normalized);
    }

    return normalized;
}

function canonicalNumericValue(value: string, family: "decimal" | "float" | "double"): string {
    switch (family) {
        case "float":
        case "double": {
            const parsed = parseFloatingPoint(value);
            if (parsed === null) return value;
            if (Number.isNaN(parsed)) return "NaN";
            if (parsed === Infinity) return "INF";
            if (parsed === -Infinity) return "-INF";
            const canonical = parsed === 0 ? 0 : parsed;
            return String(canonical);
        }
        case "decimal": {
            const parsed = parseDecimal(value);
            if (parsed === null) return value;
            const sign = parsed.sign === -1 ? "-" : "";
            if (parsed.fracDigits === "") return `${sign}${parsed.intDigits}`;
            return `${sign}${parsed.intDigits}.${parsed.fracDigits}`;
        }
    }
}

function canonicalBooleanValue(value: string): string {
    if (value === "true" || value === "1") return "true";
    if (value === "false" || value === "0") return "false";
    return value;
}

// ---------------------------------------------------------------------------
// Node-table entry and identity-constraint evaluation
// ---------------------------------------------------------------------------

/** A single entry in a node table: a key-sequence (tuple of field values) */
export interface NodeTableEntry {
    readonly keySequence: ReadonlyArray<FieldValue>;
    readonly targetNode: Element;
}

/**
 * Per-validation state for identity-constraint evaluation.
 * Builds node tables bottom-up through the element tree and resolves
 * keyrefs as each element's table becomes available (XSD 1.0 §3.11.4-5).
 *
 * After validating an element's content and attributes, call
 * `evaluateElement()` to evaluate its identity constraints and build its
 * node table from children's tables + its own qualified entries.
 */
export class IdentityConstraintEvaluator {
    /**
     * Per-element, per-constraint node tables. Each element's table for a
     * constraint K is the union of (all children's K-tables) + (the element's
     * own qualified K-entries if K is declared on the element).
     *
     * Populated bottom-up: children are validated first, so by the time a
     * parent calls evaluateElement, all children's tables are in the map.
     */
    readonly elementNodeTables = new Map<Element, Map<IdentityConstraintDefinition, NodeTableEntry[]>>();

    /** Map of element → type definition for field type resolution. */
    readonly nodeTypes = new Map<Element, TypeDefinition>();

    /** Map of attribute → simple type definition for field type resolution. */
    readonly attrTypes = new Map<Attr, SimpleTypeDefinition>();

    /**
     * Evaluate the identity constraints declared on an element and build
     * its node table. Resolves keyrefs declared on this element against
     * the referenced constraint's node table (which includes entries from
     * all descendants propagated up through children).
     *
     * Must be called after the element's children and attributes have been
     * validated (so children's node tables are available in the map).
     */
    evaluateElement(
        node: Element,
        decl: ElementDeclaration,
        schema: CompiledSchema,
        report: (error: SchemaError) => void,
    ): void {
        const constraints = decl.identityConstraints;
        if (constraints.length === 0) return;

        // Step 1: gather children's node tables for each constraint in scope.
        const childrenTables = this.collectChildrenTables(node);
        const ownTable = new Map<IdentityConstraintDefinition, NodeTableEntry[]>();
        for (const [ic, entries] of childrenTables) {
            ownTable.set(ic, [...entries]);
        }

        // Step 2: evaluate each identity constraint declared on this element.
        for (const ic of constraints) {
            const targetNodes = this.evaluateSelector(node, ic, report);
            if (targetNodes === null) continue;

            const qualifiedEntries = this.evaluateFields(node, ic, targetNodes, report);
            if (qualifiedEntries === null) continue;

            // Check uniqueness (4.1 for unique, 4.2.2 for key)
            if (ic.category === "key" || ic.category === "unique") {
                this.checkUniqueness(node, ic, qualifiedEntries, report);

                // Add this element's own entries to its table for this constraint
                const existing = ownTable.get(ic) ?? [];
                existing.push(...qualifiedEntries);
                ownTable.set(ic, existing);
            }

            // Resolve keyrefs against the referenced constraint's table
            if (ic.category === "keyref") {
                this.resolveKeyref(node, ic, qualifiedEntries, ownTable, report);
            }
        }

        // Step 3: store this element's node table.
        this.elementNodeTables.set(node, ownTable);
    }

    private evaluateSelector(
        node: Element,
        ic: IdentityConstraintDefinition,
        report: (error: SchemaError) => void,
    ): Element[] | null {
        try {
            const selected = new Set<Element>();
            for (const path of ic.compiledSelector) {
                for (const n of evaluatePath(path, node)) {
                    if (n.nodeType === 1) selected.add(n as Element);
                }
            }
            return Array.from(selected);
        } catch (e) {
            report(makeError(node, "INVALID_IDENTITY_PATH",
                `Invalid selector XPath '${ic.selector}' for identity constraint ${displayQName(ic.name)}: ${e instanceof IdentityPathError ? e.message : String(e)}`));
            return null;
        }
    }

    private evaluateFields(
        node: Element,
        ic: IdentityConstraintDefinition,
        targetNodes: Element[],
        report: (error: SchemaError) => void,
    ): NodeTableEntry[] | null {
        const qualifiedEntries: NodeTableEntry[] = [];
        const keyName = displayQName(ic.name);

        for (const target of targetNodes) {
            const fieldValues: FieldValue[] = [];
            let qualified = true;

            for (let fi = 0; fi < ic.fields.length; fi++) {
                const fieldPath = ic.fields[fi]!;
                let fieldNodes: (Element | Attr)[];

                try {
                    fieldNodes = evaluatePath(ic.compiledFields[fi]!, target);
                } catch (e) {
                    report(makeError(node, "INVALID_IDENTITY_PATH",
                        `Invalid field XPath '${fieldPath}' for identity constraint ${keyName}: ${e instanceof IdentityPathError ? e.message : String(e)}`));
                    qualified = false;
                    break;
                }

                if (fieldNodes.length === 0) {
                    // Empty node-set → check if the field is a single attribute
                    // step with a default value on the target element's type.
                    // The [schema normalized value] of a defaulted attribute
                    // participates in the key-sequence (XSD 1.0 §3.11.4 note).
                    const defaultVal = this.lookupDefaultValue(target, ic.compiledFields[fi]!);
                    if (defaultVal !== null) {
                        fieldValues.push({ kind: "value", key: defaultVal });
                    } else {
                        fieldValues.push({ kind: "nil" });
                    }
                    continue;
                }

                if (fieldNodes.length > 1) {
                    report(makeError(node, "IDENTITY_CONSTRAINT_VIOLATION",
                        `Field ${fi + 1} ('${fieldPath}') of identity constraint ${keyName} selects ${fieldNodes.length} nodes, but must select at most one.`));
                    qualified = false;
                    break;
                }

                const fieldNode = fieldNodes[0]!;
                const rawValue = fieldNode.nodeType === 1
                    ? this.textContent(fieldNode as Element)
                    : (fieldNode as Attr).value ?? "";

                // Check if the field node has a complex type (must be simple)
                const fieldType = this.resolveFieldType(fieldNode);
                if (fieldNode.nodeType === 1 && fieldType && fieldType.kind === "complex-type") {
                    const ct = fieldType;
                    if (ct.contentType !== "simple") {
                        const nilAttr = (fieldNode as Element).getAttributeNS(NAMESPACE_XSI, "nil");
                        if (nilAttr !== "true") {
                            report(makeError(node, "IDENTITY_CONSTRAINT_VIOLATION",
                                `Field ${fi + 1} ('${fieldPath}') of identity constraint ${keyName} selects an element with a complex type, but must have a simple type.`));
                            qualified = false;
                            break;
                        }
                    }
                }

                fieldValues.push(computeFieldValue(fieldNode, fieldType, rawValue));
            }

            if (!qualified) continue;

            // For key: all fields must be non-nil (4.2.1: target == qualified)
            if (ic.category === "key") {
                if (this.checkKeyFields(node, ic, target, fieldValues, report)) {
                    qualifiedEntries.push({ keySequence: fieldValues, targetNode: target });
                }
            } else if (ic.category === "unique") {
                // For unique: nil fields make the node unqualified
                if (!fieldValues.some((fv) => fv.kind === "nil")) {
                    qualifiedEntries.push({ keySequence: fieldValues, targetNode: target });
                }
            } else {
                // keyref: nil fields also make the node unqualified
                if (!fieldValues.some((fv) => fv.kind === "nil")) {
                    qualifiedEntries.push({ keySequence: fieldValues, targetNode: target });
                }
            }
        }

        return qualifiedEntries;
    }

    private checkKeyFields(
        node: Element,
        ic: IdentityConstraintDefinition,
        target: Element,
        fieldValues: FieldValue[],
        report: (error: SchemaError) => void,
    ): boolean {
        let hasNil = false;
        for (const fv of fieldValues) {
            if (fv.kind === "nil") {
                hasNil = true;
                break;
            }
        }
        if (!hasNil) return true;

        for (let fi = 0; fi < fieldValues.length; fi++) {
            if (fieldValues[fi]!.kind === "nil") {
                const fieldNodes = evaluatePath(ic.compiledFields[fi]!, target);
                if (fieldNodes.length === 0) {
                    report(makeError(node, "KEY_FIELD_MISSING",
                        `Field ${fi + 1} ('${ic.fields[fi]}') of key ${displayQName(ic.name)} selects no node, but key requires every field to have a value.`));
                } else {
                    const fnode = fieldNodes[0]!;
                    if (fnode.nodeType === 1) {
                        const nilAttr = (fnode as Element).getAttributeNS(NAMESPACE_XSI, "nil");
                        if (nilAttr === "true") {
                            report(makeError(node, "KEY_FIELD_NIL",
                                `Field ${fi + 1} ('${ic.fields[fi]}') of key ${displayQName(ic.name)} selects a nilled element, but key requires every field value to be non-nil.`));
                        } else {
                            report(makeError(node, "KEY_FIELD_MISSING",
                                `Field ${fi + 1} ('${ic.fields[fi]}') of key ${displayQName(ic.name)} selects no node, but key requires every field to have a value.`));
                        }
                    }
                }
            }
        }
        return false;
    }

    private checkUniqueness(
        node: Element,
        ic: IdentityConstraintDefinition,
        entries: NodeTableEntry[],
        report: (error: SchemaError) => void,
    ): void {
        for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
                if (keySequencesEqual(entries[i]!.keySequence, entries[j]!.keySequence)) {
                    report(makeError(node, "IDENTITY_CONSTRAINT_VIOLATION",
                        `Duplicate ${ic.category} '${displayQName(ic.name)}': two elements have the same key-sequence.`));
                }
            }
        }
    }

    private resolveKeyref(
        node: Element,
        ic: IdentityConstraintDefinition,
        entries: NodeTableEntry[],
        ownTable: Map<IdentityConstraintDefinition, NodeTableEntry[]>,
        report: (error: SchemaError) => void,
    ): void {
        const referenced = ic.referencedConstraint;
        if (!referenced) return;
        const refTable = ownTable.get(referenced) ?? [];
        const keyName = displayQName(ic.name);

        for (const entry of entries) {
            let found = false;
            for (const refEntry of refTable) {
                if (keySequencesEqual(entry.keySequence, refEntry.keySequence)) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                report(makeError(entry.targetNode, "KEYREF_VIOLATION",
                    `Keyref '${keyName}' has a key-sequence with no matching entry in the referenced ${displayQName(referenced.name)}.`));
            }
        }
    }

    /**
     * Collect the node tables from all direct children of the given element.
     */
    private collectChildrenTables(node: Element): Map<IdentityConstraintDefinition, NodeTableEntry[]> {
        const merged = new Map<IdentityConstraintDefinition, NodeTableEntry[]>();
        for (const child of childElements(node)) {
            const childTable = this.elementNodeTables.get(child);
            if (!childTable) continue;
            for (const [ic, entries] of childTable) {
                const existing = merged.get(ic) ?? [];
                existing.push(...entries);
                merged.set(ic, existing);
            }
        }
        return merged;
    }

    private resolveFieldType(node: Element | Attr): TypeDefinition | null {
        if (node.nodeType === 1) {
            const el = node as Element;
            const fromMap = this.nodeTypes.get(el);
            if (fromMap) return fromMap;
        } else {
            const attr = node as Attr;
            const fromMap = this.attrTypes.get(attr);
            if (fromMap) return fromMap;
        }
        return null;
    }

    /**
     * Look up the default or fixed value for an attribute field when the
     * attribute is absent from the instance. Checks the target element's
     * type definition for an attribute use with a matching name.
     *
     * Returns null when there is no default or the field path is not a
     * single attribute step.
     */
    private lookupDefaultValue(target: Element, path: CompiledPath): string | null {
        // Only handle single attribute steps (e.g. @val, @foo).
        // Multi-step paths like a/@val require the intermediate element to
        // exist, so the node-set would not be empty if the intermediate
        // element exists. If the intermediate element is absent, there's
        // no default to apply.
        if (path.descendant || path.steps.length !== 1) return null;
        const step = path.steps[0]!;
        if (step.kind !== "attribute") return null;

        const attrName = step.nameTest.local;
        if (attrName === "*") return null;

        // Find the target element's type and look for the attribute use
        const targetType = this.nodeTypes.get(target);
        if (!targetType || targetType.kind !== "complex-type") return null;

        for (const use of targetType.attributeUses) {
            if (use.declaration.name.localName === attrName) {
                return use.defaultValue ?? use.fixed ?? null;
            }
        }

        return null;
    }

    private textContent(node: Element): string {
        let out = "";
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === 3 || child.nodeType === 4) {
                out += child.nodeValue ?? "";
            }
        }
        return out;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function keySequencesEqual(a: ReadonlyArray<FieldValue>, b: ReadonlyArray<FieldValue>): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const av = a[i]!;
        const bv = b[i]!;
        if (av.kind === "nil" && bv.kind === "nil") continue;
        if (av.kind === "nil" || bv.kind === "nil") return false;
        if (av.key !== bv.key) return false;
    }
    return true;
}

function makeError(
    node: { lineNumber?: number; columnNumber?: number },
    code: SchemaErrorCode,
    message: string,
): SchemaError {
    return {
        severity: "error",
        code,
        message,
        location: locationOf(node),
        phase: "instance-validation",
    };
}

export class IdentityPathError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "IdentityPathError";
    }
}