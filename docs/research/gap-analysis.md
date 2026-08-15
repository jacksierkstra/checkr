# Gap analysis: checkr capabilities vs XSTS

> Research findings for [CHK-005 — Gap analysis: checkr capabilities vs XSTS](../backlog/active/CHK-005-gap-analysis.md).
> Primary sources: the checkr source tree (`src/lib/`, commit as of this analysis) and the XSTS structure research in [xsts-structure-acquisition.md](xsts-structure-acquisition.md) (CHK-002). XSTS test-set organization and group counts are cited from the CHK-002 findings, which were themselves compiled against the W3C XSTS release.

---

## 1. Method and honesty caveat

**Support levels in this document are code-inspection assessments, not measured XSTS pass rates.** checkr has never executed an XSTS test — there is no test runner yet (that is [CHK-006 — Test runner architecture for XSTS](../backlog/active/CHK-006-test-runner-design.md)) — so "full/partial/missing" below answer "does an implementation exist that plausibly satisfies the XSTS expectations for this feature area", derived by reading the parser, resolver, validator, and their tests.

| Level | Meaning here |
|---|---|
| **full** | Implementation exists and plausibly satisfies XSTS expectations for the area. |
| **partial** | An implementation exists but is incomplete or incorrect relative to the XSD 1.0 spec, so only a subset of that area's tests can pass. |
| **missing** | No implementation at all; behavior is undefined (usually: the construct is silently ignored, so validity outcomes are wrong or vacuous). |
| **unknown** | Code exists that touches the feature but its behavior against XSTS expectations is unmeasured and not obviously wrong — used sparingly. |

**Structural caveat that conditions every row:** [CHK-004 — Decide checkr's XSD component model architecture](../backlog/archive/CHK-004-architecture-decision.md) (ADR at `docs/adr/architecture-component-model.md`) already found that checkr's current pipeline model "cannot express the full XSD 1.0 component model" and decided on a rearchitecture to a typed component graph with eager compile-time resolution. No feature area is rated **full** because every area is built on the flat model slated for replacement; "partial" rows sit on a model that the rearchitecture will supersede.

---

## 2. Current architecture at a glance (what the code actually does)

Inspected files: `src/lib/types/xsd.ts`, `src/lib/xsd/pipeline/*` (parser, elementAssembler, steps, documentExtractor), `src/lib/xsd/resolvers/typeReferenceResolver.ts`, `src/lib/validator/*` (validator, pipeline, steps), `src/lib/xml/parser.ts`, plus all `*.test.ts` and the benchmark fixtures.

**The XSD model is flat** (`src/lib/types/xsd.ts`). An `XSDSchema` is `targetNamespace? + elements: XSDElement[] + types: {name: XSDElement}`. An `XSDElement` is a bag of optional fields:

```ts
name; namespace?; type?; minOccurs?; maxOccurs? (number | "unbounded");
attributes?: XSDAttribute[] (name, type?, use?, fixed?);
children?: XSDElement[]; enumeration?: string[]; choices?: XSDChoice[];
pattern?; minLength?; maxLength?;
```

There are no types for: model groups, wildcards, identity constraints, notations, derivation (restriction/extension), simpleContent/complexContent, list/union varieties, substitution groups, or facets beyond the four above.

**Parse phase** (`src/lib/xsd/pipeline/parser.ts`):
1. XML-parse the `.xsd` (xmldom, `src/lib/xml/parser.ts`).
2. Extract only top-level `xs:element` and `xs:complexType` nodes by **namespaceURI** (`documentExtractor.ts`).
3. Run each node through pipeline steps that extract name/type/min-maxOccurs, attributes, enumeration, nested elements (sequence/choice flattening), and restriction facets. Steps 2–5 of these use **`getElementsByTagName("xs:…")` — prefix-sensitive string matching** (`steps/attributes.ts`, `steps/enumeration.ts`, `steps/restriction.ts`): a schema that binds any prefix other than literally `xs` (e.g. `xmlns:xsd=`) silently loses its attributes and facets.
4. Merge partials, apply `targetNamespace` to global elements recursively (but **not** to the `types` map), then resolve `type=` references.

**Type reference resolution is a shallow copy** (`src/lib/xsd/resolvers/typeReferenceResolver.ts`): when an element has `type="QName"`, the resolver copies only `children` and `choices` from the referenced global type onto the element. **Attributes and facets (enumeration/pattern/lengths) are dropped**, and resolution is by local name after `:` split — the `xs:`/`xsd:` prefix is ignored, so `type="xs:string"` attempts a (failing) global lookup and keeps the raw string.

**Validate phase** (`src/lib/validator/validator.ts` + `pipeline/steps/*`):
- Global step: occurrence counts via `xmlDoc.getElementsByTagName(name)` — **document-wide**, not context-scoped, so any same-named element anywhere in the document counts toward a declaration.
- Node steps: type (regexes below), attributes (required/fixed/2 type regexes), constraints (pattern/minLength/maxLength, `xs:string` only), required children (presence vs `minOccurs` only — **order is never enforced**).
- Choice: "exactly one match", counted document-wide (`getElementsByTagName` again).
- Child matching uses `child.tagName === childSchema.name` — **prefix-sensitive and namespace-blind** for children, which breaks namespaced instances except where namespaces happen to line up (the benchmark works only because children are unprefixed).
- Built-in type "validation" is five lexical regexes: `xs:string` (no check), `xs:integer`, `xs:decimal`, `xs:boolean`, `xs:date` (format `YYYY-MM-DD` only). **Every other type — including `xs:float`, used in the benchmark — falls through to no check.**

**Known defects that will skew any XSTS run** (each with a file reference):
- Root-level `maxOccurs="unbounded"` parses to `1` (`steps/rootElement.ts`; the test `should handle maxOccurs='unbounded'` asserts `maxOccurs: 1`).
- Root-level `minOccurs` defaults to `0` (`steps/rootElement.ts`) while nested elements default to `1` (`steps/nestedElement.ts`); XSD 1.0 defaults `minOccurs` to `1`.
- Non-integer `maxOccurs` yields `NaN` (`steps/rootElement.ts`, asserted in tests).
- Attribute/facet values are read with prefix-sensitive `getElementsByTagName("xs:…")` (see above).
- `type=" xs:string "` with stray whitespace survives parsing (asserted in `rootElement.test.ts`) and then matches no validator branch.
- `validateAttributes` matches by qualified name (`node.getAttribute(attr.name)`), which breaks for prefixed attributes in instances.
- The `types` map never receives the target namespace, and resolver output carries no namespace onto children, so typed elements' children are matched namespace-blind.

---

## 3. Part 1 — Structures: feature-by-feature

XSTS test sets are cited by their manifest file (Microsoft `msMeta/*.xml`, Sun `sunMeta/*.testSet`, NIST, Boeing) per the CHK-002 findings. Group counts are the totals from CHK-002 §5.

| Feature area | Level | What exists | Gaps (why tests will fail) | XSTS test sets | Complexity to close |
|---|---|---|---|---|---|
| **Schema element & schema-wide attributes** (`targetNamespace`, `elementFormDefault`, `attributeFormDefault`, `version`, `id`, `xml:lang`) | **partial** | `targetNamespace` read and applied to global elements; rest ignored. | No handling of `elementFormDefault`/`attributeFormDefault`; forms affect whether local elements/attributes are namespace-qualified, which checkr's namespace-blind child matching can't honor. | `Schema_w3c.xml` (132 groups), Sun `Schema.testSet` | medium |
| **Annotations** (`xs:annotation`, `xs:documentation`, `xs:appinfo`) | **partial** (inert) | Not parsed at all. | Inert: annotations never affect validity, so schema/instance tests that merely *include* annotations pass vacuously; tests asserting annotation semantics (none in XSTS — annotations have no validity effect) are N/A. | `Annotations_w3c.xml` (80 groups, 0 instance tests) | small |
| **Element declarations** (global/local, inline type, `type=` ref) | **partial** | Global + inline complexType elements parsed; `type=` shallow-resolved. | No `ref=`; no `nillable`; no `abstract`; no `substitutionGroup`; no `default`/`fixed`; no `block`/`final`. Local declarations with `ref` are dropped. Type resolution loses attributes/facets (see §2). | `Element_w3c.xml` (358), Sun `ElemDecl.testSet` | medium |
| **Element references** (`<xs:element ref="…">`) | **missing** | — | `ParseNestedElementsStep.parseElement` returns `null` when `name` is absent, so referenced elements vanish from the content model entirely. | `Element_w3c.xml`, Sun `ElemDecl.testSet` | medium |
| **Substitution groups** | **missing** | — | Nothing parses `substitutionGroup`; no substitution-group hierarchy; validation cannot accept substituted elements. | `Element_w3c.xml`, `Additional_w3c.xml` (287) | large |
| **`nillable`, `xsi:nil`, `abstract`, `final`, `block`** | **missing** | — | No parsing, no `xsi:*` attribute handling in the validator. | `Element_w3c.xml`, `ComplexType_w3c.xml`, `Additional_w3c.xml` | large |
| **Element `default`/`fixed`** | **missing** | — | Only attribute `fixed` exists; element default/fixed values unparsed, no defaulted-value injection. | `Element_w3c.xml` | medium |
| **Attribute declarations & use** (`use`, `default`, `fixed`, form) | **partial** | `name`, `type`, `use` (required/optional), `fixed` parsed and checked. | No `use="prohibited"`; no `default` (no value injection); no attribute form handling; type check limited to integer/boolean regexes; matching by qualified name breaks prefixed attributes; facets on attributes never enforced. Attributes inherited via `type=` are dropped (§2). | `Attribute_w3c.xml` (290), Sun `AttrDecl.testSet`, `AttrUse.testSet` | medium |
| **Attribute references** (`<xs:attribute ref="…">`) | **missing** | — | Not parsed (`steps/attributes.ts` reads only `name`). | `Attribute_w3c.xml`, Sun `AttrDecl.testSet` | medium |
| **Attribute groups** (`xs:attributeGroup`, `ref`) | **missing** | — | Not parsed; no expansion of group contents. | `AttributeGroup_w3c.xml` (114), Sun `AGroupDef.testSet` | medium |
| **Complex types — content models** | **partial** | Element-only content via `sequence` (flattened into `children`); empty content possible. | No `mixed`; no `simpleContent`; no `complexContent`; no derivation; sequence **order not enforced** (presence-only); `all` unsupported; nested compositor semantics flattened and lossy. | `ComplexType_w3c.xml` (551), Sun `CType.testSet` | large |
| **Complex content derivation** (`xs:complexContent`/`xs:extension`/`xs:restriction`) | **missing** | — | Nothing parses `complexContent`; no derivation rules (UPA, particle derivation, type hierarchy). Includes the **CTR-with-`all` implementation-defined** cases (see §6). | `ComplexType_w3c.xml`, `Additional_w3c.xml` | large |
| **Simple content** (`xs:simpleContent`) | **missing** | — | Not parsed; no value+attributes model. | `ComplexType_w3c.xml` | medium |
| **Mixed content** | **missing** | — | `mixed` attribute ignored; validator requires pure element children. | `ComplexType_w3c.xml`, Sun `CType.testSet` | medium |
| **Model groups: `sequence`, `choice`** | **partial** | Both flattened into `children`/`choices`; validator enforces "exactly one of" for choice (document-wide count). | No order enforcement (sequence), no occurrence semantics on groups, nested choice/sequence flattened and ambiguous, no UPA/ambiguity checks; choice counting is document-wide, not per-parent. | `ModelGroups_w3c.xml` (391), Sun `MGroup.testSet` | large |
| **Model group: `all`** | **missing** | — | `xs:all` never parsed; its particles vanish. | `ModelGroups_w3c.xml` | medium |
| **Named model groups** (`xs:group`, `ref`) | **missing** | — | Not parsed. | `Group_w3c.xml` (218), Sun `MGroupDef.testSet` | medium |
| **Particles / occurrence** (`minOccurs`, `maxOccurs`, `unbounded`) | **partial** | Parsed on elements; occurrence counted globally. | Root `unbounded` → `1` bug; root `minOccurs` defaults `0`; non-integer → `NaN`; counts document-wide instead of per-parent-particle; group-level occurrence ignored. | `Particles_w3c.xml` (856 — the largest structure set) | medium |
| **Wildcards** (`xs:any`, `xs:anyAttribute`, `processContents`, namespace constraints) | **missing** | — | Not parsed; lax/skip/strict semantics absent. | `Wildcards_w3c.xml` (315), Sun `Wildcard.testSet` | medium |
| **Identity constraints** (`xs:unique`, `xs:key`, `xs:keyref`, selector/field XPath) | **missing** | — | Not parsed. Requires an XPath-subset evaluator — CHK-004 explicitly flags this as a known-complex deferred piece. | `IdentityConstraint_w3c.xml` (840), Sun `IdConstrDefs.testSet` | large |
| **Notations** (`xs:notation`) | **missing** | — | Not parsed; no `NOTATION` type support. | `Notations_w3c.xml` (116), Sun `Notation.testSet` | small |
| **`xs:include` / `xs:import` / `xs:redefine`** | **missing** | — | Single-document parser; no multi-schema resolution, no grammar-per-namespace (CHK-004 §4). | `Schema_w3c.xml`, `Additional_w3c.xml`, Sun `Schema.testSet` | large |
| **`xsi:type`, `xsi:schemaLocation`, `xsi:noNamespaceSchemaLocation`** | **missing** | — | No `xsi:*` handling anywhere in the validator. | `Additional_w3c.xml`, `Element_w3c.xml` | medium |
| **Schema conformance (schema-for-schemas)** | **missing** | — | Malformed schemas are not diagnosed as schema errors; compilation never fails on schema invalidity (CHK-004 §7 requires this at compile time). Every `invalid`-expected **schemaTest** is currently un-detectable. | All sets with `schemaTest`s (~14,328 schema tests) | large |
| **Errata 1.0 fixes** | **missing** | — | No errata behavior implemented. | `Errata10_w3c.xml` (19) | small (per-case) |

---

## 4. Part 2 — Datatypes: feature-by-feature

The XSTS datatype weight is concentrated in `DataTypes_w3c.xml` (2,247 groups), NIST `NISTXMLSchemaDatatypes.testSet` (3,953 groups — the largest single test set in the suite), and `Regex_w3c.xml` (2,591 groups).

### 4.1 Built-in atomic types (Part 2, plus the ID/IDREF/NOTATION family)

The validator's full type vocabulary is five lexical regexes (`src/lib/validator/pipeline/steps/type.ts`): `xs:string` (vacuous), `xs:integer`, `xs:decimal`, `xs:boolean`, `xs:date` (format-only). **All other built-in types fall through to no check** — meaning an instance value of any other type is accepted regardless of content.

| Type family | Built-ins | Level | Notes |
|---|---|---|---|
| String family | `string`, `normalizedString`, `token`, `language`, `Name`, `NCName`, `NMTOKEN`, `NMTOKENS`, `ID`, `IDREF`, `IDREFS`, `ENTITY`, `ENTITIES` | **missing** | `xs:string` is a pass-through; the rest are unhandled. No lexical-space checks (NCName rules, token normalization, NMTOKEN syntax, ID/IDREF uniqueness), no whitespace normalization. |
| Numeric | `float`, `double`, `decimal` (+ derived: `integer` and the 11 `…Integer` family), `positiveInteger`… | **partial** | `xs:integer`/`xs:decimal` regexes only; **`xs:float`/`xs:double` (used in the benchmark fixture!) are unvalidated**; no value-space bounds, no exponential/special-value (`NaN`, `INF`) forms, no derived-integer hierarchy. |
| Date/time | `dateTime`, `date`, `time`, `gYear`, `gYearMonth`, `gMonth`, `gMonthDay`, `gDay`, `duration` | **partial** | `xs:date` is a shape regex (`YYYY-MM-DD`) — `2023-13-45` passes; no calendar validity, no timezone handling, no `dateTime`/`time`/`duration` at all. |
| Boolean | `boolean` | **partial** | Regex over `true/false/1/0`; no whitespace-collapse-before-lexing (XSD collapses whitespace first). |
| Binary | `hexBinary`, `base64Binary` | **missing** | Unhandled. |
| URI / QName | `anyURI`, `QName`, `NOTATION` | **missing** | Unhandled. |
| Meta | `anySimpleType`, `anyAtomicType`, `error` | **missing** | Unhandled. |

### 4.2 Facets

| Facet | Level | Notes |
|---|---|---|
| `enumeration` | **partial** | Parsed for simpleType restrictions and enforced on element text; **not enforced on attributes**; not enforced on typed references (dropped by resolver). |
| `pattern` | **partial** | Uses **JavaScript `RegExp`**, which is not XSD regex (see §4.3); applied to `xs:string` only; never applied to attributes. |
| `minLength`, `maxLength` | **partial** | `xs:string` only; measured in **UTF-16 code units** (`text.length`), not code points — wrong for supplementary characters; not applied to attributes or list types. |
| `length`, `whiteSpace`, `minInclusive`, `maxInclusive`, `minExclusive`, `maxExclusive`, `totalDigits`, `fractionDigits` | **missing** | None parsed or enforced. |
| Facet inheritance across type hierarchies | **missing** | No type hierarchy exists; facets are only read from the innermost `simpleType` of an element. |

### 4.3 XSD regular expressions

| Area | Level | Notes |
|---|---|---|
| XSD regex dialect | **missing** | `Regex_w3c.xml` is the single largest test set in the suite (2,591 groups / 1,586 instance tests). XSD regex (Part 2 Appendix E) differs from JS regex: character class subtraction, different escapes, `\i`/`\c` name escapes, no anchors/lookaround, `{m,n}` semantics. checkr has no XSD-regex engine; the current `pattern` implementation substitutes JS `RegExp`, which will fail the majority of these tests. | large |

### 4.4 List and union types

| Area | Level | Notes |
|---|---|---|
| `xs:list` | **missing** | Not parsed (NIST `list/` data untouched); no whitespace-split item validation, no item-type facets. |
| `xs:union` | **missing** | Not parsed (NIST `union/` data untouched); no member-type trial validation. |
| `xs:simpleType` as global type referenced by `type=` | **partial** | Parsed only when inline under an element; global simpleType definitions are not extracted at all (the extractor keeps only `element` and `complexType` nodes). |

### 4.5 Value space, lexical space, whitespace normalization

| Area | Level | Notes |
|---|---|---|
| Whitespace normalization (`preserve`/`replace`/`collapse` per type and `whiteSpace` facet) | **missing** | Text is `trim()`ed ad hoc in validator steps, which is not XSD normalization. |
| Value-space vs lexical-space separation, canonical forms | **missing** | Validation is pure lexical regex; no value construction, no order/collation semantics for date/time/duration comparisons. |

---

## 5. XSTS expected-outcome vocabulary and what checkr must do

The XSTS `expected/@validity` union (CHK-002 §4) includes outcomes beyond `valid`/`invalid`. The **test runner** (CHK-006) owns the scoring policy, but it needs checkr-side decisions, recorded here:

| Outcome | Meaning | checkr-side decision required |
|---|---|---|
| `valid` / `invalid` | The ordinary cases. | checkr must produce the right boolean. Today it does only for the narrow subset in §3–§4. |
| `implementation-defined` | Result depends on implementation-defined behavior. | **checkr must declare its choice and be self-consistent.** Concrete cases in the 1.0 suite: **CTR with `all`-groups** (three options: `CTR-all-compile`, `CTR-all-runtime`, `CTR-all-idep`) and Unicode-version-sensitive string tests. Recommendation: **`CTR-all-compile`** (always reject at compile time — aligns with CHK-004 §5/§7 eager compile-time validation); record the choice in the runner config. |
| `implementation-dependent` | Varies among implementations; not explicitly defined. | checkr documents its behavior; runner treats it as pass-when-consistent, else skip. |
| `indeterminate` | Spec under-determined / disputed. | **Runner skips** (no pass/fail). Do not "fix" checkr to chase these. |
| `notKnown` | Validity unknown. | **Runner skips.** |
| `runtime-schema-error` | Instance whose schema has a latent error detected at runtime. | Requires the latent-error taxonomy (CHK-004 §6 `SchemaError` codes) to be surfaced consistently; until the rearchitecture, checkr has no error taxonomy at all, so these are un-runnable. |
| `invalid-latent` (schema tests) | Schema has a latent error; processors may or may not detect it. | Same as above — needs the schema-error model. |
| `disputed-test` / `disputed-spec` (test `status`) | Test or spec is disputed. | **Runner honors `current/@status` and excludes disputed tests from the pass/fail score** (CHK-002 §4). |

Additional declared-behavior decisions checkr should fix now so the runner has stable ground:
1. **Target XML version: XML 1.0** (xmldom is XML 1.0; XML 1.1 datatype differences are out of scope for the 1.0 suite's default results).
2. **Target Unicode version: whatever the JS engine provides** — document it (e.g. "Unicode version of the Node/V8 runtime"). For `length`/`minLength`/`maxLength`, count **code points**, not UTF-16 code units (current `text.length` is wrong on supplementary characters).
3. **Element/attribute form handling** must follow `elementFormDefault`/`attributeFormDefault` (currently ignored, §3).
4. **Schema conformance checking at compile time** (CHK-004 §7) is the prerequisite for scoring `invalid`-expected schemaTests correctly.

---

## 6. Where the XSTS weight sits (drives ordering)

Group counts per CHK-002 §5, Microsoft sets by feature:

| Test set | Groups | Weight |
|---|---|---|
| `Regex_w3c.xml` | 2,591 | Datatypes — regex engine |
| `DataTypes_w3c.xml` | 2,247 | Datatypes — built-ins + facets |
| NIST `NISTXMLSchemaDatatypes` | 3,953 | Datatypes — atomic/list/union |
| `Particles_w3c.xml` | 856 | Structures — occurrence |
| `IdentityConstraint_w3c.xml` | 840 | Structures — key/unique/keyref |
| `ComplexType_w3c.xml` | 551 | Structures — content models/derivation |
| `ModelGroups_w3c.xml` | 391 | Structures — compositors |
| `Element_w3c.xml` | 358 | Structures — element declarations |
| `Wildcards_w3c.xml` | 315 | Structures — any/anyAttribute |
| `Attribute_w3c.xml` | 290 | Structures — attribute declarations |
| `Additional_w3c.xml` | 287 | Cross-cutting |
| `Group_w3c.xml` | 218 | Structures — named groups |
| `Notations_w3c.xml` | 116 | Structures — notations |
| `Schema_w3c.xml` | 132 | Structures — schema element |
| `AttributeGroup_w3c.xml` | 114 | Structures — attribute groups |
| `Annotations_w3c.xml` | 80 | Structures — annotations (inert) |
| `Errata10_w3c.xml` | 19 | Errata |
| Sun `suntest` + 12 sets | 679 | Structures |
| Boeing `BoeingXSDTestSet` | 6 | Integration |

**~60% of the suite by group count is datatypes + regex** (NIST 3,953 + Regex 2,591 + DataTypes 2,247 ≈ 8,791 of ~14,383). Structures are dominated by particles, identity constraints, complex types, and model groups.

---

## 7. Complexity summary and map implications

### Complexity to reach XSTS-passing per missing/partial area

| Rating | Areas |
|---|---|
| **small** | Annotations (inert), Notations, Errata per-case, element/attribute `default`/`fixed` enforcement, boolean tightening |
| **medium** | Schema element + forms, element declarations + refs, attribute declarations + refs, attribute groups, `all`, named model groups, particles/occurrence, wildcards, simpleContent, mixed content, `xsi:*` attributes, remaining built-in datatype lexical checks, list/union types, facets (length/whiteSpace/bounds/totalDigits), whitespace normalization |
| **large** | Component-graph rearchitecture itself (CHK-004 — prerequisite for everything), substitution groups + abstract/final/block, complex content derivation (restriction/extension + CTR), identity constraints (XPath subset), include/import/redefine multi-document resolution, schema-for-schemas bootstrap, XSD regex engine, full value-space datatypes (date/time/duration arithmetic, QName) |

### Implications for the map

1. **The rearchitecture (CHK-004) is the gating dependency for XSTS passage.** Every "partial" row above is partial precisely because of the flat model; the ADR's component graph is the substrate the runner needs. Implementation cannot begin before the component-graph work lands.
2. **Datatypes and regex are the biggest score surface** (~60% of groups). A dedicated XSD-regex engine and a real datatype value-space layer are the highest-leverage feature work after the rearchitecture.
3. The map's fog entry **"Feature implementation order"** is now specifiable: the scheduling decision (which feature areas to implement first to maximize early XSTS progress, informed by §6 volume and §7 complexity) becomes a ticket of its own, depending on this gap analysis.
4. **The runner design (CHK-006) and this analysis feed each other**: the runner's scoring policy must implement §5 (outcome vocabulary, disputed-test exclusion, declared-behavior options), and the `implementation-defined` decisions in §5 (CTR option, Unicode/XML version) are inputs CHK-006 will need.
