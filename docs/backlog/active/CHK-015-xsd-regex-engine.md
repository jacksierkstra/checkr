---
id: CHK-015
title: "XSD regex engine"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "draft"
depends_on: ["CHK-010"]
required_context: ["docs/research/gap-analysis.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

`Regex_w3c.xml` is the single largest test set in the XSTS (2,591 groups, 1,586 instance tests), and the gap analysis rates the current state `missing`: the `pattern` facet compiles a JavaScript `RegExp`, whose semantics differ from the XSD regex dialect in Part 2 Appendix E (character-class subtraction, `\i`/`\c` name escapes, category/block escapes, no anchors/lookaround). This ticket replaces JS regex with a real XSD regex engine.

## Deliver

An XSD regex dialect engine (Part 2 Appendix E) that compiles `pattern` facet values and validates instance text per XSD semantics.

## Acceptance Criteria

- [ ] The dialect supports character-class subtraction `[a-z-[aeiou]]`, `\i`/`\c` name escapes, and category/block escapes, per Appendix E
- [ ] Anchors, lookaround, and backreferences — invalid in XSD regex — are rejected as schema errors, not silently mis-compiled
- [ ] Repetition and multi-character escapes behave per the spec, including the 1.0 restrictions (no multi-char escapes inside character classes)
- [ ] The `pattern` facet compiles through the engine and validates instance text end-to-end
- [ ] A representative slice of the Regex test set's behaviors passes checkr's internal tests

## Out of Scope

- The other facets (CHK-010, CHK-012)
- Unicode-category data beyond what the engine needs (document the target Unicode version per the gap analysis §5)

## Dependencies

Blocked by CHK-010 (the facet framework the engine plugs into).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can an XSD regex dialect engine (Appendix E) replace the JS-RegExp `pattern` implementation with XSD-correct semantics?

## Answer

*(to be filled on resolution)*

## Decision / Outcome

*(filled in after completion)*