---
id: CHK-003
title: "Research reference XSD validator architectures"
type: "ticket"
wayfinder_type: "research"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: []
required_context: []
optional_context: []
assignee: null
estimate: null
---

## Context

Checkr's current architecture is pipeline-based: a linear transformation from XML DOM nodes to an XSDSchema model, then a validator pipeline that walks the XML tree. The XSD 1.0 spec is a graph of schema components with complex cross-references (type derivation, substitution groups, identity constraints, etc.). Established validators like Apache Xerces-J and libxml2 use a "component model" architecture. We need to understand these reference architectures to inform checkr's rearchitecture.

## Must Follow

Follow the research skill protocol: produce a markdown summary as a linked asset.

## Do Not

Do not make architecture decisions for checkr — that's a separate grilling ticket. This is purely about understanding how other validators work.

## Deliver

A markdown document (linked from this ticket's Answer) that answers:

1. **Xerces-J**: How does Xerces-J's XSD processor work? What are its key components? (SchemaGrammar, XSElementDeclaration, XSTypeDefinition, etc.) How does it handle type derivation, model groups, identity constraints?
2. **libxml2**: How does libxml2's schema validation work? What's the internal data model? How does it differ from Xerces?
3. **Component model pattern**: What is the common architecture across reference validators? What are the key abstractions?
4. **Schema compilation vs validation**: How do reference validators separate "schema compilation" (building the component model from the XSD document) from "instance validation" (walking the XML tree against the compiled model)?
5. **Error handling**: How do they report errors? (error codes, messages, line numbers, severity levels)
6. **Test suite integration**: How do these validators integrate with the XSTS? Do they use the same test harness or a custom one?
7. **Key design decisions**: What are the hardest design decisions in building an XSD processor? (e.g., lazy vs eager resolution, schema component identity, namespace handling)

## Acceptance Criteria

- [ ] The markdown summary covers all seven questions above
- [ ] The summary includes concrete code references, class names, or architecture diagrams where helpful
- [ ] The summary is linked from this ticket's Answer section

## Out of Scope

- Any architecture decisions for checkr
- Implementation work
- Downloading or building Xerces-J/libxml2

## Risks

- The source code of these validators is large and complex — we may need to focus on high-level architecture rather than deep implementation details
- Documentation may be sparse or outdated

## Dependencies

None.

## Verification

```
# The deliverable is a markdown file — verify it exists and covers the questions
ls docs/backlog/active/CHK-003-reference-architectures.md
```

## Question

What are the component-model architectures used by reference XSD validators (Xerces-J, libxml2) for XSD 1.0 processing, and what key design patterns should inform checkr's rearchitecture?

## Answer

*(to be filled on resolution)*