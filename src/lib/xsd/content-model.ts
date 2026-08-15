/**
 * Content-model analysis for UPA (Unique Particle Attribution) determinism.
 *
 * Uses the position-automaton (Glushkov) construction to check whether a
 * content model is one-unambiguous per XSD 1.0 §3.8.6 ("cos-nonambig").
 *
 * A content model is UPA-valid iff the Glushkov automaton (position automaton)
 * is deterministic: no ε-closed state set contains two or more positions with
 * intersecting symbol classes.
 *
 * Terminology:
 *   - A "position" is a particle whose term is an element declaration or
 *     wildcard.  Occurrence wrappers on the particle (minOccurs/maxOccurs)
 *     add self-loop follow edges.
 *   - A "symbol" is either a concrete element QName or a wildcard namespace
 *     set.  Two symbols intersect if they could match the same element
 *     information item.
 *
 * @module
 */

import {
    ElementDeclaration,
    ModelGroup,
    ModelGroupKind,
    Particle,
    ParticleTerm,
    QName,
    qnameEqual,
    qnameKey,
    Wildcard,
} from "@lib/types/component-graph";

// ---------------------------------------------------------------------------
// Symbol representation
// ---------------------------------------------------------------------------

export type ElementSymbol =
    | { kind: "element"; qname: QName }
    | { kind: "wildcard"; nsSet: WildcardNamespaceSet };

export type WildcardNamespaceSet =
    | { type: "any" }
    | { type: "other"; target: string | null }
    | { type: "local" }
    | { type: "uris"; uris: ReadonlySet<string> };

/** Two symbols (element or wildcard) intersect if they can match the same element. */
export function symbolsIntersect(a: ElementSymbol, b: ElementSymbol): boolean {
    if (a.kind === "element" && b.kind === "element") {
        return qnameEqual(a.qname, b.qname);
    }
    if (a.kind === "element" && b.kind === "wildcard") {
        return wildcardMatchesNs(b.nsSet, a.qname.namespaceURI);
    }
    if (a.kind === "wildcard" && b.kind === "element") {
        return wildcardMatchesNs(a.nsSet, b.qname.namespaceURI);
    }
    // Both wildcards
    if (a.kind === "wildcard" && b.kind === "wildcard") {
        return wildcardSetsIntersect(a.nsSet, b.nsSet);
    }
    return false;
}

function wildcardMatchesNs(ns: WildcardNamespaceSet, nsURI: string | null): boolean {
    switch (ns.type) {
        case "any": return true;
        case "other": return nsURI !== null && nsURI !== ns.target;
        case "local": return nsURI === null;
        case "uris": return nsURI !== null && ns.uris.has(nsURI);
    }
}

function wildcardSetsIntersect(a: WildcardNamespaceSet, b: WildcardNamespaceSet): boolean {
    // Convert to function-based check: is there any nsURI that both match?
    // For real-world schemas, the sets are simple: any, other, local, small URI sets.
    // We can test the few candidate namespaces.
    const candidates = collectCandidateNs(a, b);
    for (const ns of candidates) {
        if (wildcardMatchesNs(a, ns) && wildcardMatchesNs(b, ns)) return true;
    }
    return false;
}

function collectCandidateNs(a: WildcardNamespaceSet, b: WildcardNamespaceSet): (string | null)[] {
    const out = new Set<string | null>();
    // Add representative namespaces from each set
    const addFrom = (ns: WildcardNamespaceSet) => {
        if (ns.type === "any") { out.add(null); out.add("urn:test"); }
        else if (ns.type === "other") { out.add(null); out.add("urn:other"); }
        else if (ns.type === "local") { out.add(null); }
        else if (ns.type === "uris") { for (const u of ns.uris) out.add(u); }
    };
    addFrom(a);
    addFrom(b);
    // Also add the other's target namespace if applicable
    if (a.type === "other") out.add(a.target);
    if (b.type === "other") out.add(b.target);
    return Array.from(out);
}

// ---------------------------------------------------------------------------
// Position info — per-particle analysis for the Glushkov automaton
// ---------------------------------------------------------------------------

export interface Position {
    /** The particle whose term is an element or wildcard declaration. */
    readonly particle: Particle;
    /** The symbol this position matches. */
    readonly symbol: ElementSymbol;
    /** Whether this position is the "last" of a match — i.e., it can be the final element. */
    /** Convenience: the element or wildcard name for error messages. */
    readonly label: string;
}

export interface ParticleInfo {
    /** First positions — positions that can start a match of this particle. */
    readonly first: ReadonlySet<Position>;
    /** Last positions — positions that can end a match of this particle. */
    readonly last: ReadonlySet<Position>;
    /** Follow edges — pairs (x, y) meaning y can immediately follow x. */
    readonly follow: Map<Position, ReadonlySet<Position>>;
    /** Whether this particle can match empty. */
    readonly nullable: boolean;
    /** All positions in the subtree (for state construction). */
    readonly allPositions: ReadonlySet<Position>;
}

/**
 * Build the Glushkov-automaton info for a particle tree.
 * The returned info is used for the subset-construction determinism check.
 */
export function buildParticleInfo(particle: Particle): ParticleInfo {
    const follow = new Map<Position, Set<Position>>();
    const allPositions = new Set<Position>();

    const info = buildInfo(particle, follow, allPositions);

    // Convert follow to ReadonlySet
    const frozenFollow = new Map<Position, ReadonlySet<Position>>();
    for (const [k, v] of follow) {
        frozenFollow.set(k, Object.freeze(new Set(v)));
    }

    return {
        first: info.first,
        last: info.last,
        follow: frozenFollow,
        nullable: info.nullable,
        allPositions: Object.freeze(allPositions),
    };
}

interface RawInfo {
    first: ReadonlySet<Position>;
    last: ReadonlySet<Position>;
    nullable: boolean;
}

function buildInfo(
    particle: Particle,
    follow: Map<Position, Set<Position>>,
    allPositions: Set<Position>,
): RawInfo {
    const term = particle.term;
    const minOccurs = particle.minOccurs;
    const maxOccurs = particle.maxOccurs;

    if (term.kind === "element" || term.kind === "wildcard") {
        // Leaf particle — one position
        const pos = createPosition(particle, term);
        allPositions.add(pos);

        const first = new Set<Position>([pos]);
        const last = new Set<Position>([pos]);
        const nullable = minOccurs === 0;

        // Self-loop for maxOccurs > 1
        if (maxOccurs === "unbounded" || (typeof maxOccurs === "number" && maxOccurs > 1)) {
            addFollow(follow, pos, pos);
        }

        return { first, last, nullable };
    }

    // Group term
    const group = term as ModelGroup;
    const children = group.particles;

    // Build info for each child
    const childInfos = Array.from(children).map((c) => buildInfo(c, follow, allPositions));

    // Compute first, last, nullable for the group
    const first = computeGroupFirst(group.kind, childInfos);
    const last = computeGroupLast(group.kind, childInfos);
    const nullable = computeGroupNullable(group.kind, childInfos);

    // Add follow edges between children
    addGroupFollowEdges(group.kind, children, childInfos, follow);

    // Apply occurrence wrapper: if particle maxOccurs > 1, add self-loop on last × first
    if (maxOccurs === "unbounded" || (typeof maxOccurs === "number" && maxOccurs > 1)) {
        for (const lp of last) {
            for (const fp of first) {
                addFollow(follow, lp, fp);
            }
        }
    }

    return { first, last, nullable };
}

function createPosition(particle: Particle, term: ParticleTerm): Position {
    if (term.kind === "element") {
        const el = term as ElementDeclaration;
        return {
            particle,
            symbol: { kind: "element", qname: el.name },
            label: `{${el.name.namespaceURI ?? ""}}${el.name.localName}`,
        };
    }
    // Wildcard
    const wc = term as Wildcard;
    return {
        particle,
        symbol: { kind: "wildcard", nsSet: nsSetLabel(wc) },
        label: `wildcard(${nsSetLabel(wc).type})`,
    };
}

function nsSetLabel(wc: Wildcard): WildcardNamespaceSet {
    // For now, we don't have wildcard namespace attributes parsed from the schema.
    // We'll use a conservative "any" for all wildcards, which is safe for UPA detection
    // (may cause false positives but not false negatives).
    // This will be refined in CHK-021.
    // Actually, the XSD compiler's buildWildcard doesn't parse namespace attributes yet.
    // For now, treat all wildcards as "any" to be conservative.
    return { type: "any" };
}

function addFollow(follow: Map<Position, Set<Position>>, from: Position, to: Position): void {
    let s = follow.get(from);
    if (!s) {
        s = new Set();
        follow.set(from, s);
    }
    s.add(to);
}

// ---------------------------------------------------------------------------
// Group first/last/nullable
// ---------------------------------------------------------------------------

function computeGroupFirst(
    kind: ModelGroupKind,
    childInfos: RawInfo[],
): ReadonlySet<Position> {
    const out = new Set<Position>();

    switch (kind) {
        case "sequence": {
            // first = union of first of each child until a non-nullable child
            for (const info of childInfos) {
                for (const p of info.first) out.add(p);
                if (!info.nullable) break;
            }
            break;
        }
        case "choice":
        case "all": {
            // Union of all children
            for (const info of childInfos) {
                for (const p of info.first) out.add(p);
            }
            break;
        }
    }

    return Object.freeze(out);
}

function computeGroupLast(
    kind: ModelGroupKind,
    childInfos: RawInfo[],
): ReadonlySet<Position> {
    const out = new Set<Position>();

    switch (kind) {
        case "sequence": {
            // last = union of last of each child from the end until a non-nullable
            for (let i = childInfos.length - 1; i >= 0; i--) {
                for (const p of childInfos[i]!.last) out.add(p);
                if (!childInfos[i]!.nullable) break;
            }
            break;
        }
        case "choice":
        case "all": {
            for (const info of childInfos) {
                for (const p of info.last) out.add(p);
            }
            break;
        }
    }

    return Object.freeze(out);
}

function computeGroupNullable(
    kind: ModelGroupKind,
    childInfos: RawInfo[],
): boolean {
    switch (kind) {
        case "sequence": return childInfos.every((c) => c.nullable);
        case "choice": return childInfos.some((c) => c.nullable);
        case "all": return childInfos.length === 0 || childInfos.every((c) => c.nullable);
    }
}

// ---------------------------------------------------------------------------
// Follow edges between group children
// ---------------------------------------------------------------------------

function addGroupFollowEdges(
    kind: ModelGroupKind,
    children: readonly Particle[],
    childInfos: RawInfo[],
    follow: Map<Position, Set<Position>>,
): void {
    switch (kind) {
        case "sequence": {
            // For each pair (i, j) with i < j where all between are nullable:
            // add (last(pi) × first(pj)).
            for (let i = 0; i < children.length; i++) {
                for (let j = i + 1; j < children.length; j++) {
                    // Check if all between i and j are nullable
                    let allBetweenNullable = true;
                    for (let k = i + 1; k < j; k++) {
                        if (!childInfos[k]!.nullable) { allBetweenNullable = false; break; }
                    }
                    if (!allBetweenNullable) continue;

                    // Add (last(pi) × first(pj))
                    for (const lp of childInfos[i]!.last) {
                        for (const fp of childInfos[j]!.first) {
                            addFollow(follow, lp, fp);
                        }
                    }
                }
            }
            break;
        }
        case "choice": {
            // In choice, no cross-child edges (each child is an alternative).
            // Follow edges are only internal to each child.
            break;
        }
        case "all": {
            // In all, children are unordered; each child appears at most once.
            // No cross edges (each child is independent, maxOccurs=1).
            break;
        }
    }
}

// ---------------------------------------------------------------------------
// UPA violation reporting
// ---------------------------------------------------------------------------

export interface UpaViolation {
    /** The two conflicting positions (their symbols overlap). */
    readonly positionA: Position;
    readonly positionB: Position;
    /** Human-readable description. */
    readonly message: string;
}

/**
 * Check whether a particle tree has UPA violations.
 * Returns a list of violations; empty list means UPA-valid.
 */
export function checkUPA(particle: Particle): UpaViolation[] {
    const info = buildParticleInfo(particle);

    // Subset construction: start from first(P), iteratively generate new states.
    const visited = new Set<string>();
    const queue: ReadonlySet<Position>[] = [info.first];
    const violations: UpaViolation[] = [];

    visited.add(stateKey(info.first));

    while (queue.length > 0) {
        const state = queue.shift()!;

        // Check for ambiguity in this state: any two positions with intersecting symbols
        const positions = Array.from(state);
        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                if (symbolsIntersect(positions[i]!.symbol, positions[j]!.symbol)) {
                    violations.push({
                        positionA: positions[i]!,
                        positionB: positions[j]!,
                        message: `Content model is ambiguous: element '${positions[i]!.label}' can match both positions (${positions[i]!.label} and ${positions[j]!.label})`,
                    });
                }
            }
        }

        // Generate transitions from this state
        // For each DISTINCT symbol class in the state, compute next state
        const transitions = new Map<string, Set<Position>>();
        for (const pos of state) {
            const symKey = symbolKey(pos.symbol);
            if (!transitions.has(symKey)) {
                transitions.set(symKey, new Set());
            }
            const next = info.follow.get(pos);
            if (next) {
                for (const n of next) {
                    transitions.get(symKey)!.add(n);
                }
            }
        }

        for (const nextSet of transitions.values()) {
            if (nextSet.size === 0) continue;
            const key = stateKey(nextSet);
            if (!visited.has(key)) {
                visited.add(key);
                queue.push(Object.freeze(nextSet));
            }
        }
    }

    return violations;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateKey(state: ReadonlySet<Position>): string {
    // Sort positions by a stable key for deterministic state keys
    const keys = Array.from(state).map((p) => positionKey(p)).sort();
    return `{${keys.join(",")}}`;
}

function positionKey(p: Position): string {
    return `${p.label}:${symbolKey(p.symbol)}`;
}

function symbolKey(sym: ElementSymbol): string {
    if (sym.kind === "element") return qnameKey(sym.qname);
    return `wildcard:${sym.nsSet.type}`;
}