#!/usr/bin/env node
// Unit tests for the guardrail inventory and invariant extractors.
// Run with: node --test scripts/guardrails.test.mjs
//
// These run as their own check (scripts/agent-check.mjs guardrails runs
// `node --test scripts/guardrails.test.mjs`), so the extractors are
// self-verifying on every agent-check invocation. They are driven off fixture
// text rather than the live repo: a test that asserted against the real
// package.json would fail on every legitimate dependency change, which is the
// baseline's job, not the test's.
import test from "node:test";
import assert from "node:assert/strict";

import {
  envKeys,
  libLayerViolations,
  npmDependencies,
  relativeImportsOutsideTests,
} from "./guardrails.mjs";

test("npmDependencies merges both blocks and sorts", () => {
  const pkg = JSON.stringify({
    dependencies: { "@xmldom/xmldom": "^0.9.8" },
    devDependencies: { jest: "^29.7.0", typescript: "^5.7.3" },
  });

  // A dependency added as a devDependency still ships through the toolchain,
  // so both blocks count.
  assert.deepEqual(npmDependencies(pkg), ["@xmldom/xmldom", "jest", "typescript"]);
});

test("npmDependencies tolerates a manifest with neither block", () => {
  assert.deepEqual(npmDependencies(JSON.stringify({ name: "x" })), []);
});

test("envKeys extracts, dedupes and sorts across sources", () => {
  const sources = [
    'const api = process.env.CHECKR_API_BASE_URL ?? "";',
    "if (process.env.NODE_ENV === 'test') {}\nconst b = process.env.NODE_ENV;",
  ];

  assert.deepEqual(envKeys(sources), ["CHECKR_API_BASE_URL", "NODE_ENV"]);
});

test("envKeys ignores non-env property access", () => {
  // Lowercase and dynamic reads are not literal `process.env.X` keys.
  assert.deepEqual(envKeys(["process.environment.FOO", "process.env[key]", "notprocess.env.X"]), []);
});

test("libLayerViolations flags an upward import and an unknown target", () => {
  const files = [
    // `types` reaching up into `xml` — the clearest layer break.
    {
      path: "src/lib/types/violation.ts",
      text: 'import { XMLDocument } from "@lib/xml/parser";',
    },
    // A target outside src/lib entirely — nothing under src/lib may reach it.
    {
      path: "src/lib/xsd/violation.ts",
      text: 'import { runWithResourceUsage } from "@lib/benchmark/utils";',
    },
    // `validator` importing `xsd` is fine — xsd is below validator.
    {
      path: "src/lib/validator/ok.ts",
      text: 'import { XSDParser } from "@lib/xsd/parser";',
    },
    // Deep paths stay within their layer: `@lib/types/xsd` is a `types` import.
    {
      path: "src/lib/types/ok.ts",
      text: 'import { XSDElement } from "@lib/types/xsd";',
    },
    // Core is the composition root and may import everything.
    {
      path: "src/lib/core/main.ts",
      text: 'import { Validator } from "@lib/validator/validator";\nimport { XMLParser } from "@lib/xml/parser";',
    },
  ];

  assert.deepEqual(libLayerViolations(files), [
    { path: "src/lib/types/violation.ts", target: "xml" },
    { path: "src/lib/xsd/violation.ts", target: "benchmark" },
  ]);
});

test("libLayerViolations ignores non-lib paths and dependency imports", () => {
  const files = [
    // Not under src/lib — out of scope for the layering rule.
    { path: "src/index.ts", text: 'export { Checkr } from "@lib/core/main";' },
    // A node_modules import is a dependency, not a layer edge.
    { path: "src/lib/xml/parser.ts", text: 'import { DOMParser } from "@xmldom/xmldom";' },
  ];

  assert.deepEqual(libLayerViolations(files), []);
});

test("relativeImportsOutsideTests flags non-test relative imports", () => {
  const files = [
    {
      path: "src/lib/xsd/parser.ts",
      text: 'import { DocumentExtractor } from "./utils/documentExtractor";',
    },
    {
      path: "src/benchmark/run.ts",
      text: 'import { runWithResourceUsage } from "../lib/core/main";',
    },
    // A colocated test importing its sibling is the deliberate pattern.
    {
      path: "src/lib/xsd/parser.test.ts",
      text: 'import { XSDParser } from "./parser";',
    },
    // Alias and dependency imports are not relative.
    {
      path: "src/lib/xml/parser.ts",
      text: 'import { XMLDocument } from "@lib/types/xml";\nimport { DOMParser } from "@xmldom/xmldom";',
    },
  ];

  assert.deepEqual(relativeImportsOutsideTests(files), [
    { path: "src/benchmark/run.ts", spec: "../lib/core/main" },
    { path: "src/lib/xsd/parser.ts", spec: "./utils/documentExtractor" },
  ]);
});

test("relativeImportsOutsideTests is not fooled by the word from inside a string", () => {
  // `from` inside a template literal or comment is not an import specifier.
  const files = [
    {
      path: "src/lib/types/validation.ts",
      text: 'const msg = "a message from ./elsewhere";\n// import from "./nope"\nimport { XSDElement } from "@lib/types/xsd";',
    },
  ];

  assert.deepEqual(relativeImportsOutsideTests(files), []);
});
