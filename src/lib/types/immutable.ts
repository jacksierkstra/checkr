/**
 * Recursively freeze an object graph so that no property can be mutated.
 * Returns the same reference.
 */
export function deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;

    // Already frozen — skip to avoid re-traversal cycles.
    if (Object.isFrozen(value)) return value;

    if (value instanceof Map) {
        Object.freeze(value);
        for (const v of value.values()) deepFreeze(v);
        return value;
    }

    if (Array.isArray(value)) {
        Object.freeze(value);
        for (const v of value) deepFreeze(v);
        return value;
    }

    Object.freeze(value);
    for (const key of Object.keys(value)) {
        deepFreeze((value as Record<string, unknown>)[key]);
    }

    return value;
}