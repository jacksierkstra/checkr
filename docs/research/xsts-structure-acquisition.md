# XSTS — Structure and Acquisition

> Research findings for [CHK-002](../backlog/active/CHK-002-xsts-research.md).
> Investigated against primary sources: W3C XSTS website, the XSTS release archive, the TS schema document, the TS framework document, and the TS FAQ.

---

## 1. Acquisition

### Host

The XSTS is hosted at the W3C:

- **Home page**: <https://www.w3.org/XML/2004/xml-schema-test-suite/>
- **Namespace**: `http://www.w3.org/XML/2004/xml-schema-test-suite/`
- **CVS repository**: `dev.w3.org:/sources/public`, module `XML/xml-schema-test-suite/2004-01-14/xmlschema2006-11-06`
- **CVS web interface**: <http://dev.w3.org/cvsweb/XML/xml-schema-test-suite/2004-01-14/xmlschema2006-11-06/>

### How to get it

**Two-step process required** (as of the W3C's own docs):

1. **Download the latest full release** as a tar.gz archive:
   - Latest 1.0 release: <https://www.w3.org/XML/2004/xml-schema-test-suite/xmlschema2006-11-06/xsts-2007-06-20.tar.gz> (4.2 MB)
   - Older 1.0 release: <https://www.w3.org/XML/2004/xml-schema-test-suite/xmlschema2002-01-16/xsts-2002-01-16.tar.gz> (6.73 MB)

2. **Check out the CVS tree** for post-release changes:
   ```bash
   # Anonymous checkout (no account needed)
   cvs -d :pserver:anonymous@dev.w3.org:/sources/public checkout \
     -d xsts-current \
     XML/xml-schema-test-suite/2004-01-14/xmlschema2006-11-06
   ```
   Then merge the release archive with the CVS checkout via `cp -R -p -n`.

### Version to target

The **2006-11-06 release** (packaged 2007-06-20) is the canonical release for XSD 1.0 Second Edition. It includes contributions from NIST (2004), Sun (2006), Microsoft (2006), and Boeing (2007). The CVS repository contains metadata updates since then, but no new test data for 1.0.

### Quick one-liner (for automation)

```bash
curl -sLo xsts.tar.gz \
  "https://www.w3.org/XML/2004/xml-schema-test-suite/xmlschema2006-11-06/xsts-2007-06-20.tar.gz"
tar -xzf xsts.tar.gz
# -> produces directory xmlschema2006-11-06/
```

---

## 2. Directory structure

```
xmlschema2006-11-06/
├── 00COPYRIGHT                     # W3C Document Notice and License
├── suite.xml                       # Root testSuite manifest (entry point)
├── ms_ChangeLog                    # Microsoft contribution changelog
├── sun_ChangeLog                   # Sun contribution changelog
├── boeing_ChangeLog                # Boeing contribution changelog
│
├── msMeta/                         # Microsoft metadata (17 testSet files)
│   ├── Additional_w3c.xml
│   ├── Annotations_w3c.xml
│   ├── AttributeGroup_w3c.xml
│   ├── Attribute_w3c.xml
│   ├── ComplexType_w3c.xml
│   ├── DataTypes_w3c.xml
│   ├── Element_w3c.xml
│   ├── Errata10_w3c.xml
│   ├── Group_w3c.xml
│   ├── IdentityConstraint_w3c.xml
│   ├── ModelGroups_w3c.xml
│   ├── Notations_w3c.xml
│   ├── Particles_w3c.xml
│   ├── Regex_w3c.xml
│   ├── Schema_w3c.xml
│   ├── SimpleType_w3c.xml
│   └── Wildcards_w3c.xml
│
├── msData/                         # Microsoft test data
│   ├── additional/
│   ├── annotations/
│   ├── attribute/
│   ├── attributeGroup/
│   ├── complexType/
│   ├── datatypes/
│   ├── element/
│   ├── errata10/
│   ├── group/
│   ├── identityConstraint/
│   ├── modelGroups/
│   ├── notations/
│   ├── particles/
│   ├── regex/
│   ├── schema/
│   ├── simpleType/
│   └── wildcards/
│
├── sunMeta/                        # Sun metadata (13 testSet files)
│   ├── suntest.testSet
│   ├── AGroupDef.testSet
│   ├── AttrDecl.testSet
│   ├── AttrUse.testSet
│   ├── CType.testSet
│   ├── ElemDecl.testSet
│   ├── IdConstrDefs.testSet
│   ├── MGroup.testSet
│   ├── MGroupDef.testSet
│   ├── Notation.testSet
│   ├── SType.testSet
│   ├── Schema.testSet
│   └── Wildcard.testSet
│
├── sunData/                        # Sun test data
│   ├── AGroupDef/
│   ├── AttrDecl/
│   ├── AttrUse/
│   ├── CType/
│   ├── ElemDecl/
│   ├── IdConstrDefs/
│   ├── MGroup/
│   ├── MGroupDef/
│   ├── Notation/
│   ├── SType/
│   ├── Schema/
│   ├── Wildcard/
│   └── combined/
│
├── nistMeta/                       # NIST metadata
│   └── NISTXMLSchemaDatatypes.testSet
│
├── nistData/                       # NIST test data
│   ├── atomic/                     # 19 atomic types (decimal, string, date, etc.)
│   ├── list/                       # List types
│   └── union/                      # Union types
│
├── boeingMeta/                     # Boeing metadata
│   └── BoeingXSDTestSet.testSet
│
└── boeingData/                     # Boeing test data
    ├── ipo1/ through ipo6/         # 6 IPO (inter-purchase order) scenarios
```

### Naming conventions

- **Metadata files**: `.xml` (Microsoft) or `.testSet` (Sun, NIST, Boeing)
- **Schema files**: `.xsd`
- **Instance files**: `.xml`
- **Other auxiliary files**: `.imp` (import), `.red` (redefine), `.ent` (entity)
- **Top-level suite manifest**: `suite.xml` or `*.suite`
- **Results files**: `*.results` or `*.results.xml`

---

## 3. Manifest format

Test cases are defined in XML metadata files conforming to the [TS schema](https://www.w3.org/XML/2004/xml-schema-test-suite/AnnotatedTSSchema.xsd) (namespace `http://www.w3.org/XML/2004/xml-schema-test-suite/`).

### Three document types

| Element | Purpose | File suffix |
|---------|---------|-------------|
| `testSuite` | Root manifest linking to all test sets | `.suite.xml` or `suite.xml` |
| `testSet` | A contributor's collection of test groups | `.testSet.xml` or `.testSet` |
| `testSuiteResults` | Test result report from a processor | `.results.xml` or `.results` |

### Hierarchy

```
testSuite ──┬── annotation (0+)
            └── testSetRef (0+) ──xlink:href──► testSet ──┬── annotation (0+)
                                                            ├── testGroup (1+) ──┬── annotation
                                                            │                      ├── documentationReference (0+)
                                                            │                      ├── schemaTest (0+) ──┬── schemaDocument (1+)
                                                            │                      │                      ├── expected (0+)
                                                            │                      │                      └── current (0+)
                                                            │                      └── instanceTest (0+) ──┬── instanceDocument (1)
                                                            │                                             ├── expected (0+)
                                                            │                                             └── current (0+)
                                                            └── testSet (0+, nested)
```

### Key elements

**`testGroup`**: A named group of related tests. Groups are the unit of categorization (by feature, spec section, etc.).

**`schemaTest`**: Tests whether a set of schema documents constitutes a conforming XSD schema. Contains:
- `schemaDocument` (1+): xlink:href to `.xsd` file(s)
- `expected` (0+): expected validity outcome
- `current` (0+): current status in the test suite

**`instanceTest`**: Tests whether an XML instance document is valid/invalid against its governing schema. Contains:
- `instanceDocument` (1): xlink:href to `.xml` file
- `expected` (0+): expected validity outcome
- `current` (0+): current status in the test suite

### Path conventions

All paths in the metadata are **relative xlink:href references** (no absolute URLs). For example:

```xml
<schemaDocument xlink:href="../msData/annotations/annotA001.xsd"/>
<instanceDocument xlink:href="../msData/complexType/ctA001.xml"/>
```

### Example: complete test group

```xml
<testSet contributor="Microsoft" name="MS-Annotations2006-07-15"
  xmlns="http://www.w3.org/XML/2004/xml-schema-test-suite/"
  xmlns:xlink="http://www.w3.org/1999/xlink">

  <testGroup name="annotA001">
    <annotation>
      <documentation>TEST :Annotation Tests : Empty annotation in schema element</documentation>
    </annotation>
    <documentationReference
      xlink:href="http://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cAnnotations"/>
    <schemaTest name="annotA001">
      <schemaDocument xlink:href="../msData/annotations/annotA001.xsd"/>
      <expected validity="valid"/>
      <current status="accepted" date="2006-07-16"/>
    </schemaTest>
  </testGroup>
</testSet>
```

---

## 4. Expected results

### Expected outcome values

The `expected/@validity` attribute encodes the prescribed outcome. It uses the `ts:expected-outcome` type, which is a union of `ts:test-outcome` and additional values:

| Value | Meaning (instance test) | Meaning (schema test) |
|-------|------------------------|----------------------|
| `valid` | Instance is valid | Schema is a conforming schema |
| `invalid` | Instance is invalid | Schema is non-conforming |
| `notKnown` | Validity is unknown | (meaningless) |
| `runtime-schema-error` | Instance has a schema with a latent error detected at runtime | (meaningless) |
| `implementation-defined` | Result depends on implementation-defined behavior | Same |
| `implementation-dependent` | Result varies among implementations (not explicitly defined) | Same |
| `indeterminate` | Spec is under-determined, contradictory, or disputed | Same |
| `invalid-latent` | (not used for instances) | Schema has a latent error; processors may or may not detect it |

### Schema validation vs instance validation

Each test group can contain **schema tests** (is the schema itself conforming?) and **instance tests** (is the instance valid against the schema?). They are independent:

```xml
<testGroup name="ctA002">
  <schemaTest name="ctA002">
    <schemaDocument xlink:href="../msData/complexType/ctA002.xsd"/>
    <expected validity="valid"/>
  </schemaTest>
  <instanceTest name="ctA002.v">
    <instanceDocument xlink:href="../msData/complexType/ctA002.xml"/>
    <expected validity="valid"/>
  </instanceTest>
</testGroup>
```

### Version-specific results

The `expected` element can carry a `version` attribute to specify different results for different XSD editions or features:

```xml
<expected version="1.0-1e" validity="invalid"/>
<expected version="1.0-2e" validity="valid"/>
```

### Test status

Each test has a `current` element with a `status` attribute:

| Status | Meaning |
|--------|---------|
| `accepted` | Test has been accepted but not yet fully reviewed |
| `stable` | Test has been reviewed and is considered correct |
| `disputed-test` | The test itself is disputed (may be incorrect) |
| `disputed-spec` | The spec is ambiguous; the test outcome is disputed |
| `queried` | A question has been raised about the test |

### Error messages

The metadata does **not** contain expected error codes or messages. The outcome is purely boolean (valid/invalid) or the extended values above. Error messages are left to the processor's discretion.

---

## 5. Test case counts

### Summary by contributor

| Contributor | Groups | SchemaTests | InstanceTests | Focus |
|-------------|--------|-------------|---------------|-------|
| NIST (2004) | 3,953 | 3,953 | 19,217 | Datatypes (Part 2) |
| Sun (2006) | 679 | 679 | 919 | Structures (Part 1) |
| Microsoft (2006) | 9,745 | 9,690 | 4,944 | Structures + Datatypes |
| Boeing (2007) | 6 | 6 | 12 | Integration scenarios |
| **Total** | **14,383** | **14,328** | **25,092** | |

### Part 1 (Structures) vs Part 2 (Datatypes)

The XSTS does not use explicit "Part 1" / "Part 2" labels. Instead, categorization is by feature area:

**Part 1 — Structures** (schema components, validation):
- Microsoft: `Annotations`, `Attribute`, `AttributeGroup`, `ComplexType`, `Element`, `Group`, `IdentityConstraint`, `ModelGroups`, `Notations`, `Particles`, `Schema`, `SimpleType`, `Wildcards`, `Additional`, `Errata10`
- Sun: All 13 test sets (structures-focused)
- Boeing: Integration scenarios

**Part 2 — Datatypes** (built-in types, facets, regex):
- NIST: The entire test set (datatypes only)
- Microsoft: `DataTypes`, `Regex`

### Data files

| Type | Count |
|------|-------|
| `.xsd` (schema files) | 14,276 |
| `.xml` (instance files) | 25,123 |
| Metadata files | ~15 |
| Total files | ~40,395 |

### Categorization by feature (Microsoft)

The Microsoft metadata is organized by XSD feature, making it easy to target specific areas:

- `Annotations_w3c.xml`: 80 groups, 0 instance tests
- `Attribute_w3c.xml`: 290 groups, 124 instance tests
- `AttributeGroup_w3c.xml`: 114 groups, 33 instance tests
- `ComplexType_w3c.xml`: 551 groups, 262 instance tests
- `DataTypes_w3c.xml`: 2,247 groups, 1,213 instance tests
- `Element_w3c.xml`: 358 groups, 174 instance tests
- `Group_w3c.xml`: 218 groups, 126 instance tests
- `IdentityConstraint_w3c.xml`: 840 groups, 224 instance tests
- `ModelGroups_w3c.xml`: 391 groups, 208 instance tests
- `Notations_w3c.xml`: 116 groups, 3 instance tests
- `Particles_w3c.xml`: 856 groups, 523 instance tests
- `Regex_w3c.xml`: 2,591 groups, 1,586 instance tests
- `Schema_w3c.xml`: 132 groups, 35 instance tests
- `SimpleType_w3c.xml`: 340 groups, 109 instance tests
- `Wildcards_w3c.xml`: 315 groups, 119 instance tests
- `Additional_w3c.xml`: 287 groups, 193 instance tests
- `Errata10_w3c.xml`: 19 groups, 12 instance tests

---

## 6. Known issues

### Bugzilla

The XSTS uses the W3C public Bugzilla instance for tracking issues:
- **Product**: `XML Schema Test Suite`
- **URL**: <https://www.w3.org/Bugs/Public/query.cgi?product=XML+Schema+Test+Suite>

### Types of known issues

Based on the process document and schema documentation:

1. **Disputed tests** (`status="disputed-test"`): Tests where the correctness of the test itself is contested. These are tracked in Bugzilla.

2. **Disputed spec interpretations** (`status="disputed-spec"`): Tests where the spec is ambiguous and the WG cannot agree on the expected outcome. The expected outcome is marked `indeterminate`.

3. **Complex-type restriction (CTR) with `all`-groups**: The spec allows three implementation-defined behaviors for detecting faulty `all`-group restrictions:
   - `CTR-all-compile`: Always detect at compile time
   - `CTR-all-runtime`: Always detect at runtime
   - `CTR-all-idep`: Implementation-dependent

4. **Unicode version sensitivity**: Some datatype tests (e.g., string matching) depend on the Unicode version.

5. **XML version sensitivity**: Tests involving XML 1.0 vs XML 1.1 datatypes may produce different results.

6. **CVS access**: The CVS repository at `dev.w3.org` is behind Cloudflare, which may block automated access. The release archive is the most reliable acquisition path.

### Community reports

- **Mailing list**: `public-xml-schema-testsuite@w3.org` (archived at <https://lists.w3.org/Archives/Public/public-xml-schema-testsuite/>)
- **Saxon/Xerces reports**: The CVS repository contains result reports from Saxon 8.9 and XSV that show which tests pass/fail for these reference implementations. These can be used as a sanity check for our own test runner.

---

## 7. License

### License type

The XSTS is made available under the **W3C Document Notice and License** (dated 5 April 1999):
- <https://www.w3.org/Consortium/Legal/copyright-documents-19990405.html>

This is confirmed by the `00COPYRIGHT` file in the release archive and the `suite.xml` annotation.

### What it allows

- **Use, copy, and distribute** the test suite in any medium for any purpose, without fee or royalty
- **Required**: Include a link/URL to the original W3C document, the copyright notice, and the status of the document
- **Attribution**: W3C requests attribution in derived works

### What it does NOT allow

- **Modifications or derivatives**: The document license does not grant the right to create modifications or derivatives. However, the Copyright FAQ describes additional requirements that may grant this right.

### Recommended approach

- **Vendor the test suite**: Yes, we can download and include the tar.gz archive in our test runner repository. We must include the copyright notice and a link to the original.
- **Reference it**: We can reference the W3C URL directly.
- **Do NOT modify the test data**: If we need to add or change tests, those should be separate test files in our own repository, not modifications of the XSTS files.
- **Best practice**: Download the release archive as part of the test runner setup, cache it, and extract it. Update the copyright file from the `00COPYRIGHT` in the archive.

---

## Key URLs reference

| Resource | URL |
|----------|-----|
| XSTS home page | <https://www.w3.org/XML/2004/xml-schema-test-suite/> |
| Latest 1.0 release (tar.gz) | <https://www.w3.org/XML/2004/xml-schema-test-suite/xmlschema2006-11-06/xsts-2007-06-20.tar.gz> |
| TS Schema (XSD) | <https://www.w3.org/XML/2004/xml-schema-test-suite/AnnotatedTSSchema.xsd> |
| TS Framework document | <https://www.w3.org/XML/2004/xml-schema-test-suite/schemaframework.html> |
| TS FAQ | <https://www.w3.org/XML/2004/xml-schema-test-suite/schemafaq.html> |
| TS Process document | <https://www.w3.org/XML/2004/xml-schema-test-suite/XMLSchemaTS-Process.html> |
| CVS web interface | <http://dev.w3.org/cvsweb/XML/xml-schema-test-suite/2004-01-14/xmlschema2006-11-06/> |
| Bugzilla (XSTS) | <https://www.w3.org/Bugs/Public/query.cgi?product=XML+Schema+Test+Suite> |
| W3C Document License | <https://www.w3.org/Consortium/Legal/copyright-documents-19990405.html> |