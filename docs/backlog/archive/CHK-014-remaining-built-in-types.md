---
id: CHK-014
title: "Remaining built-in types"
type: "ticket"
wayfinder_type: "task"
parent: "CHK-001"
area: "meta"
priority: "high"
status: "done"
depends_on: ["CHK-010"]
required_context: ["docs/research/gap-analysis.md"]
optional_context: ["docs/research/xsts-structure-acquisition.md"]
assignee: null
estimate: null
---

## Context

Four built-in families remain unhandled after the string, numeric, and date/time tickets: binary (`hexBinary`, `base64Binary`), URI (`anyURI`), and the name-space types (`QName`, `NOTATION`), plus `boolean`, whose current check the gap analysis flags as missing whitespace-collapse-before-lexing. This ticket closes the built-in catalogue.

## Deliver

`hexBinary`, `base64Binary`, `anyURI`, `QName`, `NOTATION`, and `boolean` with correct lexical and value-space behavior.

## Acceptance Criteria

- [ ] `hexBinary` and `base64Binary` validate lexical form (including the `length`/`minLength`/`maxLength` facets measured in octets per the spec)
- [ ] `anyURI` validates per its lexical rules
- [ ] `QName` values parse as `{namespaceURI}localName` resolved against in-scope namespaces
- [ ] `NOTATION`-typed values must reference a declared notation; the type works with notation declarations once those land (CHK-026)
- [ ] `boolean` collapses whitespace before accepting exactly true/false/1/0

## Out of Scope

- Notation declarations themselves (CHK-026)
- Namespace machinery for QName resolution (CHK-017 provides the in-scope namespace context)

## Dependencies

Blocked by CHK-010 (simple-type/facet framework).

## Verification

```
node scripts/agent-check.mjs test
node scripts/agent-check.mjs build
```

## Question

Can the remaining built-ins (binary, anyURI, QName, NOTATION, boolean) land on the facet framework?

## Answer

Yes. A new `checkRemainingFamilyLexicalSpace` entry point (in `src/lib/xsd/remaining-types.ts`) walks the base chain to the nearest remaining-family built-in and applies per-type lexical checks, mirroring the string/numeric/date-time family modules (CHK-011/012/013). The facet framework now measures `length`/`minLength`/`maxLength` in octets for hexBinary/base64Binary via `binaryOctetLength`, falling back to code points for every other type.

## Decision / Outcome

Implemented CHK-014: the remaining built-in types land on the facet framework with lexical-space validation wired into the instance validator (`validateTextValue`), following the same family-checker pattern as CHK-011/012/013.

What was built (`src/lib/xsd/remaining-types.ts`):

- **boolean** — accepts exactly `true|false|1|0`; whitespace is collapsed first (the built-in's `whiteSpace` facet is already `collapse`, and `normalizeWhiteSpace` runs before the lexical check in `validateTextValue`), closing the gap-analysis §4.1 note that collapse-before-lexing was missing.
- **hexBinary** — even-length hex-digit strings (empty = zero octets valid). Per XSD 1.0 the lexical space has no interior whitespace; collapse normalises leading/trailing but a single interior space survives and correctly fails.
- **base64Binary** — RFC 2045 base64 with proper padding to a multiple of 4 characters and zero-unused-bits enforcement on the final group (`[AQgw]==` for the 2-char case, `[AEIMQUYcgkosw048]=` for the 3-char case), matching the strict reading of Part 2 §3.2.16.
- **anyURI** — pragmatic permissive check (as Xerces/Saxon/.NET do): after collapse, reject only control characters and interior space; empty string accepted as a valid relative reference. Full RFC 3986 validation is not practical at schema-validation time.
- **QName / NOTATION** — lexical QName form (NCName or `prefix:NCName`, at most one colon). Namespace resolution to `{namespaceURI}localName` is deferred to CHK-017 (in-scope namespace context); NOTATION's "must reference a declared notation" requirement is deferred to CHK-026 (notation declarations).

Length-family facets for the binary types now count octets (`hexBinary` = hex pairs, `base64Binary` = decoded length), per Part 2 §4.3.3; `facets.ts` consults `binaryOctetLength` before falling back to code points.

Alternatives considered: a single regex-only boolean check (rejected — no whitespace handling); treating anyURI as "anything goes" with no check at all (rejected — control characters are never valid in a URI and XSTS tests exercise them); allowing interior whitespace in hex/base64 (rejected — XSD 1.0 lexical spaces do not permit it, unlike XSD 1.1).

Note: the ledger at HEAD incorrectly marks CHK-006/007/015–028 as `done` (a bulk status edit landed with the CHK-012 archival commit); their brief files say `draft` and the features are unimplemented. The ledger entries were corrected to match the briefs in this change so the finish-backlog workflow can find the true frontier.