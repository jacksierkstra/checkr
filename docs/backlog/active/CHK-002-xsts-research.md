---
id: CHK-002
title: "Research the XSTS structure and acquisition"
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

The W3C XML Schema Test Suite (XSTS) is the operational definition of XSD 1.0 conformance. Before we can do anything else — design the test runner, plan features, measure progress — we need to understand exactly what we're working with. This research ticket covers acquisition, structure, format, and expected results.

## Must Follow

Follow the research skill protocol: produce a markdown summary as a linked asset.

## Do Not

Do not design the test runner or build infrastructure — that's a separate decision. This is purely about understanding the XSTS.

## Deliver

A markdown document (linked from this ticket's Answer) that answers:

1. **Acquisition**: Where is the XSTS hosted? (W3C CVS/git, packaged download, etc.) How do we get it? Is there a specific version/release we should target?
2. **Structure**: How is the suite organized? Directory layout? What naming conventions?
3. **Manifest format**: How are test cases defined? (`.xtf` files, XML manifests, etc.) What fields does each test case have? (schema files, instance files, expected valid/invalid per schema and per instance)
4. **Expected results**: How are they encoded? (boolean valid/invalid? error codes? error messages?) Are there different expected results for schema validation vs instance validation?
5. **Test cases count**: How many tests are in Part 1 (Structures) vs Part 2 (Datatypes)? How are they categorized? (by feature, by complexity, etc.)
6. **Known issues**: Are there any known bugs or ambiguities in the XSTS that other validators have encountered?
7. **License**: What license is the XSTS under? Can we vendor it, reference it, or must we download it fresh each time?

## Acceptance Criteria

- [ ] The markdown summary covers all seven questions above
- [ ] The summary includes concrete file paths, URLs, or commands to acquire the suite
- [ ] The summary is linked from this ticket's Answer section

## Out of Scope

- Test runner design
- Test runner implementation
- Running any tests against checkr
- Any architecture decisions

## Risks

- The XSTS may be hard to find or in a legacy format (CVS, old FTP, etc.)
- The manifest format may be undocumented or require reverse-engineering
- The suite may be very large and require significant download/processing time

## Dependencies

None.

## Verification

```
# The deliverable is a markdown file — verify it exists and covers the questions
ls docs/backlog/active/CHK-002-xsts-research.md
```

## Question

What is the exact structure, format, and acquisition path for the W3C XML Schema Test Suite (XSTS) for XSD 1.0?

## Answer

*(to be filled on resolution)*