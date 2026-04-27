# ADR-007: Dual namespace lookup pattern for DOM queries

**Status:** Superseded by [ADR-017](./ADR-017-native-domparser.md)

---

## Context

XSD documents in the wild use two distinct styles for declaring the XML Schema namespace:

1. **With explicit namespace declaration:**
   ```xml
   <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
     <xs:element name="..."/>
   </xs:schema>
   ```
   DOM queries using `getElementsByTagNameNS("http://www.w3.org/2001/XMLSchema", "element")` work here.

2. **Without a namespace declaration (or with a non-standard prefix):**
   ```xml
   <schema>
     <xs:element name="..."/>
   </schema>
   ```
   Here the namespace URI is not registered, so `getElementsByTagNameNS` returns nothing. The only working query is the prefix-based `getElementsByTagName("xs:element")`.

`@xmldom/xmldom`'s namespace handling (see [ADR-002](./ADR-002-single-runtime-dependency.md)) means that real-world XSD documents may behave differently depending on how strictly they declare namespaces.

---

## Decision

All DOM queries for XSD constructs in pipeline steps and the type resolver use the **dual-lookup pattern**: namespace-aware first, prefix-based fallback second.

```ts
const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

let el = parent.getElementsByTagNameNS(XSD_NAMESPACE, "sequence")[0] as Element;
if (!el) {
  el = parent.getElementsByTagName("xs:sequence")[0] as Element;
}
```

`ParseExtensionStep` is the canonical reference implementation.

---

## Consequences

- **Positive:** Checkr correctly handles both fully namespace-qualified and loosely-qualified XSD documents.
- **Positive:** Silent failures on valid real-world XSD inputs are avoided.
- **Negative:** Every DOM query requires two lines instead of one. Forgetting the fallback is a silent bug, not a compile-time error — the convention must be enforced by code review and tests.
- **Negative:** If a future dependency or environment change improves namespace consistency, the fallback becomes dead code that must be cleaned up.
