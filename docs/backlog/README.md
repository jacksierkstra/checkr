# Checkr Backlog

This index tracks all known gaps, bugs, and planned features for the Checkr XSD validation library. Each item has a dedicated file with a full problem description, acceptance criteria, and implementation hints.

**Status values:** `backlog` · `in-progress` · `done` · `deferred`

---

## How to use this backlog

- **Before starting work** on a bug or feature, find the relevant entry here and set its status to `in-progress`.
- **After completing** an item, update its status to `done` in both this file and the item's own `.md` file.
- **When you discover a new gap**, create a new `<id>.md` file using the template below and add a row to this table.

### Item file template

```markdown
# <id>: <Short title>

| Field    | Value                          |
|----------|--------------------------------|
| Type     | bug | feature                   |
| Priority | critical | high | medium | low |
| Status   | backlog                        |

## Problem
...

## Acceptance Criteria
- ...

## Implementation Hints
1. ...
```

---

## Bug Tracker

| ID | Priority | Status | Title |
|----|----------|--------|-------|
| [fix-long-range](./fix-long-range.md) | 🟢 low | done | xs:long / xs:unsignedLong missing value-range bounds |
| [fix-numeric-facets](./fix-numeric-facets.md) | 🔴 critical | done | Numeric facets dropped for xs: base restrictions |
| [fix-occurrence-per-parent](./fix-occurrence-per-parent.md) | 🔴 critical | done | Occurrence counting is document-global, not per-parent |
| [fix-global-simpletype](./fix-global-simpletype.md) | 🔴 critical | done | Global xs:simpleType nodes are silently discarded |
| [fix-attribute-type-parity](./fix-attribute-type-parity.md) | 🟠 high | done | Attribute type validation covers only 4 types vs ~25 for elements |
| [fix-attribute-ref-resolution](./fix-attribute-ref-resolution.md) | 🟠 high | done | xs:attribute ref= type and facet resolution |
| [fix-complex-restriction-content](./fix-complex-restriction-content.md) | 🟠 high | done | xs:complexContent restriction discards children and facets |
| [fix-all-order-independence](./fix-all-order-independence.md) | 🟡 medium | done | xs:all children incorrectly enforce sequence order |
| [fix-pattern-non-string](./fix-pattern-non-string.md) | 🟡 medium | done | Pattern facet applied only to xs:string type |
| [fix-decimal-edge-cases](./fix-decimal-edge-cases.md) | 🟢 low | done | xs:decimal rejects valid lexical forms (+1.5, .5, 001.23) |
| [fix-float-double-special](./fix-float-double-special.md) | 🟢 low | done | xs:float/xs:double missing INF, -INF, NaN |
| [fix-date-timezone](./fix-date-timezone.md) | 🟢 low | done | xs:date missing optional timezone suffix |
| [fix-duration-completeness](./fix-duration-completeness.md) | 🟢 low | done | xs:duration edge-case validation (bare T, fractional non-seconds) |
| [fix-partial-date-timezone](./fix-partial-date-timezone.md) | 🟢 low | done | xs:gYear etc. timezone offset range not validated |
| [fix-restriction-anytype](./fix-restriction-anytype.md) | 🟢 low | done | xs:restriction base="xs:anyType" not handled |
| [fix-simplecontent-restriction-merge](./fix-simplecontent-restriction-merge.md) | 🟢 low | done | xs:simpleContent restriction: facet and attribute merge incomplete |

## Feature Tracker

| ID | Priority | Status | Title |
|----|----------|--------|-------|
| [feat-simpleContent](./feat-simpleContent.md) | 🟠 high | done | xs:simpleContent parsing and validation |
| [feat-unexpected-elements](./feat-unexpected-elements.md) | 🟠 high | done | Validate unexpected elements in XML |
| [feat-unexpected-attributes](./feat-unexpected-attributes.md) | 🟠 high | done | Validate unexpected attributes in XML |
| [feat-attribute-constraints](./feat-attribute-constraints.md) | 🟠 high | done | Full attribute constraint validation |
| [feat-sequence-order](./feat-sequence-order.md) | 🟠 high | done | Enforce xs:sequence child ordering |
| [feat-sequence-choice-occurrences](./feat-sequence-choice-occurrences.md) | 🟠 high | done | xs:sequence and xs:choice group-level minOccurs/maxOccurs |
| [feat-attribute-defaults](./feat-attribute-defaults.md) | 🟡 medium | done | Apply default attribute values |
| [feat-length-facet](./feat-length-facet.md) | 🟡 medium | done | xs:length restriction facet |
| [feat-total-fraction-digits](./feat-total-fraction-digits.md) | 🟡 medium | done | xs:totalDigits / xs:fractionDigits facets |
| [feat-more-builtin-types](./feat-more-builtin-types.md) | 🟡 medium | done | Additional xs: built-in type checks |
| [feat-list-type](./feat-list-type.md) | 🟡 medium | done | xs:list simple type support |
| [feat-union-type](./feat-union-type.md) | 🟡 medium | done | xs:union simple type support (memberTypes= form; see feat-union-inline-members for inline form) |
| [feat-nillable](./feat-nillable.md) | 🟢 low | done | xs:nillable + xsi:nil support |
| [feat-whitespace-facet](./feat-whitespace-facet.md) | 🟡 medium | done | xs:whiteSpace restriction facet |
| [feat-wildcard-any](./feat-wildcard-any.md) | 🟡 medium | done | xs:any and xs:anyAttribute wildcard support |
| [feat-element-ref](./feat-element-ref.md) | 🟡 medium | done | xs:element ref and xs:attribute ref support |
| [feat-missing-builtin-types](./feat-missing-builtin-types.md) | 🟡 medium | done | Missing xs: built-in type checks (binary, date-partial, misc) |
| [feat-missing-id-types](./feat-missing-id-types.md) | 🟡 medium | done | Lexical validation for xs:QName, xs:ID, xs:IDREF, xs:IDREFS, xs:ENTITY, xs:ENTITIES, xs:NOTATION |
| [feat-list-restriction-facets](./feat-list-restriction-facets.md) | 🟡 medium | done | xs:restriction of xs:list with length facets (see feat-list-enum-pattern for enum/pattern) |
| [feat-element-default-fixed](./feat-element-default-fixed.md) | 🟢 low | done | xs:default and xs:fixed on xs:element |
| [feat-mixed-content](./feat-mixed-content.md) | 🟢 low | done | Validate xs:complexType mixed="true" content model |
| [feat-substitution-group](./feat-substitution-group.md) | 🟢 low | done | xs:substitutionGroup support |
| [feat-namespace-qualification](./feat-namespace-qualification.md) | 🟢 low | done | elementFormDefault, attributeFormDefault, and form attribute handling |
| [feat-group-attributegroup](./feat-group-attributegroup.md) | 🟠 high | done | xs:group and xs:attributeGroup named model group support |
| [feat-all-count-semantics](./feat-all-count-semantics.md) | 🟡 medium | done | xs:all full count enforcement (each child at most once) |
| [feat-identity-constraints](./feat-identity-constraints.md) | 🟡 medium | done | xs:key, xs:unique, xs:keyref identity constraint validation |
| [feat-attribute-prohibited](./feat-attribute-prohibited.md) | 🟡 medium | done | xs:attribute use="prohibited" support |
| [feat-id-idref-semantic](./feat-id-idref-semantic.md) | 🟠 high | done | xs:ID uniqueness and xs:IDREF referential integrity |
| [feat-inline-simpletype-attribute](./feat-inline-simpletype-attribute.md) | 🟡 medium | done | Inline xs:simpleType child of xs:attribute |
| [feat-simplecontent-restriction-facets](./feat-simplecontent-restriction-facets.md) | 🟡 medium | done | xs:simpleContent > xs:restriction facet extraction |
| [feat-block-final](./feat-block-final.md) | 🟢 low | done | block/final/blockDefault/finalDefault derivation control |
| [feat-notation-declaration](./feat-notation-declaration.md) | 🟡 medium | done | xs:notation declaration parsing and NOTATION value validation |
| [feat-any-processcontents](./feat-any-processcontents.md) | 🟡 medium | done | xs:any processContents enforcement (strict/lax/skip) |
| [feat-anyattribute-processcontents](./feat-anyattribute-processcontents.md) | 🟡 medium | done | xs:anyAttribute processContents enforcement |
| [feat-wildcard-namespace](./feat-wildcard-namespace.md) | 🟡 medium | done | xs:any/xs:anyAttribute namespace attribute enforcement |
| [feat-union-inline-members](./feat-union-inline-members.md) | 🟡 medium | done | xs:union with inline xs:simpleType member children |
| [feat-attr-numeric-facets](./feat-attr-numeric-facets.md) | 🟡 medium | done | Numeric facets on xs:attribute inline xs:simpleType |
| [feat-type-final-block](./feat-type-final-block.md) | 🟡 medium | done | final/block on named xs:complexType propagation |
| [feat-multiple-patterns](./feat-multiple-patterns.md) | 🟡 medium | done | Multiple xs:pattern facets treated as OR union |
| [feat-list-enum-pattern](./feat-list-enum-pattern.md) | 🟢 low | done | xs:list enumeration and pattern facets on full list value |
| [feat-complexcontent-mixed](./feat-complexcontent-mixed.md) | 🟢 low | done | xs:complexContent mixed attribute override |
| [feat-xsi-type](./feat-xsi-type.md) | 🟠 high | backlog | xsi:type runtime type substitution |
