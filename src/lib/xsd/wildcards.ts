/**
 * Wildcard namespace constraints and the spec's wildcard set algebra
 * (XSD 1.0 §3.10.1, §3.10.4, §3.10.6), CHK-021.
 *
 * The {namespace constraint} of a wildcard is normalized at compile time so
 * that `##targetNamespace` and `##local` tokens inside an explicit list are
 * resolved against the schema's target namespace: the absent (no) namespace
 * becomes the `""` sentinel, matching `namespaceKey` in namespaces.ts.
 *
 * The set operations (`wildcardSubset`, `wildcardUnion`, `wildcardIntersection`)
 * implement the spec's "intensional" algebra, where:
 * - `any` matches every namespace,
 * - `other` (a "negation" of the target) matches every *non-absent* namespace
 *   except the target (§3.10.4 rule 2.3 — the absent namespace never matches
 *   a negation),
 * - a set matches its members (the `""` member denoting the absent namespace).
 */

import { NamespaceConstraint, Wildcard } from "@lib/types/component-graph";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the `namespace` attribute of `xs:any`/`xs:anyAttribute` into a
 * normalized {namespace constraint} (defaults to `##any` when absent).
 *
 * A list containing `##any` or `##other` is a schema error per §3.10.1;
 * `namespaceConstraintTokenViolation` detects that case for the compiler to
 * report. This parser treats the single `##any`/`##other` token as
 * authoritative when it appears in a list.
 */
export function parseNamespaceConstraint(
    value: string | null,
    targetNamespace: string | null,
): NamespaceConstraint {
    if (!value) return { kind: "any" };
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
        const t = tokens[0]!;
        if (t === "##any") return { kind: "any" };
        if (t === "##other") return { kind: "other", target: targetNamespace };
        if (t === "##targetNamespace") return { kind: "uris", uris: new Set([targetNamespace ?? ""]) };
        if (t === "##local") return { kind: "uris", uris: new Set([""]) };
        return { kind: "uris", uris: new Set([t]) };
    }
    for (const t of tokens) {
        if (t === "##any") return { kind: "any" };
        if (t === "##other") return { kind: "other", target: targetNamespace };
    }
    const uris = new Set<string>();
    for (const t of tokens) {
        if (t === "##targetNamespace") uris.add(targetNamespace ?? "");
        else if (t === "##local") uris.add("");
        else uris.add(t);
    }
    return { kind: "uris", uris };
}

/**
 * Error message when a `namespace` attribute value violates the single-token
 * rule of §3.10.1 (`##any`/`##other` cannot share a list with other tokens),
 * else null. The compiler reports this as a schema error.
 */
export function namespaceConstraintTokenViolation(value: string | null): string | null {
    if (!value) return null;
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;
    if (tokens.includes("##any") || tokens.includes("##other")) {
        return `The namespace attribute value '${value}' mixes ##any or ##other with other tokens, which is not allowed (XSD 1.0 §3.10.1).`;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Matching — "Wildcard allows Namespace Name" (§3.10.4)
// ---------------------------------------------------------------------------

/**
 * Whether a namespace name (or the absent namespace, null) is valid with
 * respect to a wildcard's {namespace constraint} — the "Wildcard allows
 * Namespace Name" validation rule (XSD 1.0 §3.10.4).
 */
export function wildcardAllowsNamespace(
    constraint: NamespaceConstraint,
    namespaceURI: string | null,
): boolean {
    switch (constraint.kind) {
        case "any":
            return true;
        case "other":
            // Rule 2: the value must not be identical to the namespace test,
            // and the value must not be absent.
            return namespaceURI !== null && namespaceURI !== constraint.target;
        case "uris":
            return constraint.uris.has(namespaceURI === null ? "" : namespaceURI);
    }
}

// ---------------------------------------------------------------------------
// Intensional set algebra (§3.10.6)
// ---------------------------------------------------------------------------

/**
 * Intensional subset ("Wildcard Subset"): every namespace matched by `sub` is
 * also matched by `super`.
 */
export function wildcardSubset(sub: NamespaceConstraint, super_: NamespaceConstraint): boolean {
    if (super_.kind === "any") return true; // case 1
    if (sub.kind === "any") return false; // only case 1 admits sub = any, and super is not any
    if (sub.kind === "other") {
        // Case 2: super must be a negation of the same value.
        return super_.kind === "other" && super_.target === sub.target;
    }
    // Case 3: sub is a set.
    if (super_.kind === "other") {
        // 3.2.2: neither the negated value nor absent may be in sub's set.
        const target = super_.target;
        const negatedInSet = target === null ? sub.uris.has("") : sub.uris.has(target);
        if (negatedInSet || sub.uris.has("")) return false;
        return true;
    }
    // 3.2.1: super is a set that is a superset of sub's set.
    for (const member of sub.uris) {
        if (!super_.uris.has(member)) return false;
    }
    return true;
}

/**
 * Intensional union ("Attribute Wildcard Union", §3.10.6). Returns null when
 * the union is not expressible as a {namespace constraint} (spec case 5.3),
 * which makes the enclosing derivation a schema error.
 */
export function wildcardUnion(
    a: NamespaceConstraint,
    b: NamespaceConstraint,
): NamespaceConstraint | null {
    if (sameConstraint(a, b)) return a; // case 1
    if (a.kind === "any" || b.kind === "any") return { kind: "any" }; // case 2
    if (a.kind === "other" && b.kind === "other") {
        // Case 4: negations of different values → not(absent).
        return { kind: "other", target: null };
    }
    if (a.kind === "uris" && b.kind === "uris") {
        return { kind: "uris", uris: new Set([...a.uris, ...b.uris]) }; // case 3
    }
    // Case 5/6: one negation, one set.
    const neg = a.kind === "other" ? a : (b as { kind: "other"; target: string | null });
    const set = a.kind === "uris" ? a : (b as { kind: "uris"; uris: ReadonlySet<string> });
    const hasNegated = neg.target === null ? set.uris.has("") : set.uris.has(neg.target);
    const hasAbsent = set.uris.has("");
    if (hasNegated && hasAbsent) return { kind: "any" }; // 5.1
    if (hasNegated && !hasAbsent) return { kind: "other", target: null }; // 5.2
    if (!hasNegated && hasAbsent) return null; // 5.3 — not expressible
    return neg; // 5.4
}

/**
 * Intensional intersection ("Attribute Wildcard Intersection", §3.10.6).
 * Returns null when the intersection is not expressible.
 */
export function wildcardIntersection(
    a: NamespaceConstraint,
    b: NamespaceConstraint,
): NamespaceConstraint | null {
    if (sameConstraint(a, b)) return a; // case 1
    if (a.kind === "any") return b; // case 2
    if (b.kind === "any") return a; // case 2
    if (a.kind === "uris" && b.kind === "uris") {
        // Case 4: intersection of the sets.
        const uris = new Set<string>();
        for (const m of a.uris) if (b.uris.has(m)) uris.add(m);
        return { kind: "uris", uris };
    }
    if (a.kind === "other" && b.kind === "uris") return setMinusNegated(b, a); // case 3
    if (b.kind === "other" && a.kind === "uris") return setMinusNegated(a, b); // case 3
    // Both negations.
    if (a.kind === "other" && b.kind === "other") {
        if (a.target === null) return b; // case 6
        if (b.target === null) return a; // case 6
        return null; // case 5 — negations of different namespace names
    }
    return null;
}

/** `set ∩ not(negated)`: the set minus the negated value, minus absent (§3.10.6 case 3). */
function setMinusNegated(
    set: { kind: "uris"; uris: ReadonlySet<string> },
    neg: { kind: "other"; target: string | null },
): NamespaceConstraint {
    const uris = new Set<string>();
    for (const member of set.uris) {
        if (member === "") continue; // absent never matches a negation
        if (member === neg.target) continue; // the negated value
        uris.add(member);
    }
    return { kind: "uris", uris };
}

function sameConstraint(a: NamespaceConstraint, b: NamespaceConstraint): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === "any") return true;
    if (a.kind === "other") return a.target === (b as { kind: "other"; target: string | null }).target;
    const bUris = b as { kind: "uris"; uris: ReadonlySet<string> };
    if (a.uris.size !== bUris.uris.size) return false;
    for (const m of a.uris) if (!bUris.uris.has(m)) return false;
    return true;
}

// ---------------------------------------------------------------------------
// processContents ordering
// ---------------------------------------------------------------------------

const PROCESS_CONTENTS_ORDER: Record<"strict" | "lax" | "skip", number> = { strict: 2, lax: 1, skip: 0 };

/** Whether `a`'s processContents is identical to or stronger than `b`'s (strict > lax > skip). */
export function processContentsAtLeastAsStrict(a: Wildcard, b: Wildcard): boolean {
    return PROCESS_CONTENTS_ORDER[a.processContents] >= PROCESS_CONTENTS_ORDER[b.processContents];
}

/** Human-readable form of a {namespace constraint} for error messages. */
export function describeConstraint(constraint: NamespaceConstraint): string {
    switch (constraint.kind) {
        case "any":
            return "##any";
        case "other":
            return "##other";
        case "uris": {
            const parts = [...constraint.uris].map((m) => (m === "" ? "##local" : m)).sort();
            return parts.length > 0 ? parts.join(" ") : "(no namespace)";
        }
    }
}
