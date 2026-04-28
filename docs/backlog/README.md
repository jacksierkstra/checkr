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
| [fix-numeric-facets](./fix-numeric-facets.md) | 🔴 critical | done | Numeric facets dropped for xs: base restrictions |
| [fix-occurrence-per-parent](./fix-occurrence-per-parent.md) | 🔴 critical | done | Occurrence counting is document-global, not per-parent |
| [fix-global-simpletype](./fix-global-simpletype.md) | 🔴 critical | done | Global xs:simpleType nodes are silently discarded |

## Feature Tracker

| ID | Priority | Status | Title |
|----|----------|--------|-------|
| [feat-simpleContent](./feat-simpleContent.md) | 🟠 high | done | xs:simpleContent parsing and validation |
| [feat-unexpected-elements](./feat-unexpected-elements.md) | 🟠 high | done | Validate unexpected elements in XML |
| [feat-unexpected-attributes](./feat-unexpected-attributes.md) | 🟠 high | done | Validate unexpected attributes in XML |
| [feat-attribute-constraints](./feat-attribute-constraints.md) | 🟠 high | done | Full attribute constraint validation |
| [feat-sequence-order](./feat-sequence-order.md) | 🟠 high | in-progress | Enforce xs:sequence child ordering |
| [feat-attribute-defaults](./feat-attribute-defaults.md) | 🟡 medium | backlog | Apply default attribute values |
| [feat-length-facet](./feat-length-facet.md) | 🟡 medium | backlog | xs:length restriction facet |
| [feat-total-fraction-digits](./feat-total-fraction-digits.md) | 🟡 medium | backlog | xs:totalDigits / xs:fractionDigits facets |
| [feat-more-builtin-types](./feat-more-builtin-types.md) | 🟡 medium | backlog | Additional xs: built-in type checks |
| [feat-list-type](./feat-list-type.md) | 🟡 medium | backlog | xs:list simple type support |
| [feat-union-type](./feat-union-type.md) | 🟡 medium | backlog | xs:union simple type support |
| [feat-nillable](./feat-nillable.md) | 🟢 low | backlog | xs:nillable + xsi:nil support |
