# ADR-006: Modular, interface-backed type resolver

**Status:** Accepted

---

## Context

XSD type resolution is one of the most complex parts of the library. It involves multiple distinct responsibilities:

- **Type lookup** — finding a type definition by name in the global registry (`TypeRegistry`)
- **Element resolution** — resolving element references (`ElementResolver`)
- **Extension** — merging a base type's fields into a derived type (`TypeExtender`)
- **Restriction** — applying facets (pattern, min/max, enumeration) from a restriction onto a base type (`TypeRestrictor`)
- **Property merging** — merging partial type properties without overwriting array fields (`PropertyMerger`)
- **Caching** — storing previously resolved types to avoid redundant resolution (`ResolutionCache`)

Implementing all of this in a single class would produce a large, hard-to-test monolith. A flat set of free functions without interfaces would make the orchestrator tightly coupled to concrete implementations and difficult to extend.

---

## Decision

The type resolver is structured as `ModularTypeReferenceResolver`, which orchestrates a set of **specialised modules**, each behind a **named interface** defined in `src/lib/xsd/resolvers/modules/interfaces.ts`.

```
ModularTypeReferenceResolver
  ├── ITypeRegistry     → TypeRegistry
  ├── IElementResolver  → ElementResolver
  ├── ITypeExtender     → TypeExtender
  ├── ITypeRestrictor   → TypeRestrictor
  ├── IPropertyMerger   → PropertyMerger
  └── IResolutionCache  → ResolutionCache
```

The interface is defined first in `interfaces.ts`, then the concrete module implements it. Adding a new form of type inheritance (e.g., `xs:union`) requires adding a new interface + module pair rather than modifying existing modules.

---

## Consequences

- **Positive:** Each module is independently unit-testable against its interface.
- **Positive:** The orchestrator (`ModularTypeReferenceResolver`) is decoupled from concrete implementations, making it straightforward to swap or mock individual modules in tests.
- **Positive:** The interface-first rule enforces clear ownership of responsibilities as the resolver grows.
- **Negative:** The indirection adds boilerplate — six interfaces for six modules where a simpler design might use three or four functions.
- **Negative:** Interfaces must be kept in sync with implementations; a mismatch is a compile-time error but can still cause confusion during refactoring.
