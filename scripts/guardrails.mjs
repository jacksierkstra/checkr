#!/usr/bin/env node
// Reuse guardrails: closed-set inventories and invariants for @jacksierkstra/checkr.
//
// Scope is deliberately narrow. This script owns ONLY the guardrails that no
// existing tool in this repo already owns — there is no linter installed, so
// this script IS the enforcement tool (the "dependency-free script" rung of
// the guardrails command's tool ladder):
//
//   - npm dependencies (both blocks)      (closed set)
//   - process.env keys read by src/       (closed set, warn-only)
//   - src/lib layering                    (invariant: no upward imports)
//   - no relative imports in non-test src (invariant)
//
// Run:      node scripts/guardrails.mjs
// Rebase:   node scripts/guardrails.mjs --update   (deliberate, never to go green)
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const dataDir = path.join(scriptDir, "guardrails");

const readText = (rel) => fs.readFileSync(path.join(rootDir, rel), "utf8");

// --- extractors -------------------------------------------------------------
// Each returns a sorted array. Exported so scripts/guardrails.test.mjs can
// drive them off fixture text rather than the live repo.

/**
 * Declared npm dependencies. Both blocks count: a library added as a
 * devDependency is still a dependency of the build and ships to consumers
 * through the toolchain all the same.
 */
export function npmDependencies(packageJsonText) {
  const pkg = JSON.parse(packageJsonText);
  return [
    ...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]),
  ].sort();
}

/** `process.env.X` keys read by source files. */
export function envKeys(sources) {
  const out = new Set();
  for (const text of sources) {
    // The lookbehind is load-bearing: without it `notprocess.env.X` and
    // `foo.process.env.X` both match, and the inventory picks up keys that are
    // not reads of the real `process.env`.
    for (const match of text.matchAll(/(?<![\w$.])process\.env\.([A-Z_][A-Z_0-9]*)/g)) {
      out.add(match[1]);
    }
  }
  return [...out].sort();
}

/**
 * The src/lib layer map. Evidence-derived (not invented): these are exactly the
 * `@lib/<layer>` edges the current tree takes, and the map is a DAG —
 * `types` is the domain-neutral leaf, `core` is the composition root.
 */
const LIB_LAYERS = {
  types: new Set(["types"]),
  xml: new Set(["types", "xml"]),
  xsd: new Set(["types", "xml", "xsd"]),
  validator: new Set(["types", "xml", "xsd", "validator"]),
  core: new Set(["types", "xml", "xsd", "validator", "core"]),
};

/**
 * `src/lib` files that import from a layer their layer may not reach, as
 * `[{ path, target }]` sorted by path then target.
 *
 * Only the first segment after `@lib/` is checked: `@lib/types/xsd` is a
 * `types` import, and deeper paths stay within that layer. Unknown targets
 * (`@lib/benchmark/...`) are violations: nothing under src/lib may reach
 * outside src/lib via the alias.
 *
 * Takes `[{ path, text }]` over src/lib files; colocated `*.test.ts` files are
 * skipped internally.
 */
export function libLayerViolations(files) {
  const out = [];
  for (const { path: rel, text } of files) {
    if (/[\\/]\.test\.ts$/.test(rel) || rel.endsWith(".test.ts")) continue; // colocated test of a sibling
    const layer = rel.replace(/^.*src[\\/]lib[\\/]/, "").split(/[\\/]/)[0];
    const allowed = LIB_LAYERS[layer];
    if (!allowed) continue; // not under src/lib
    for (const match of text.matchAll(/from\s+["']@lib\/([a-z]+)/g)) {
      const target = match[1];
      if (!allowed.has(target)) out.push({ path: rel, target });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.target.localeCompare(b.target));
}

/**
 * Non-test src files that import a sibling via a relative specifier, as
 * `[{ path, spec }]` sorted by path then spec.
 *
 * The alias convention (`@lib/*`, `@benchmark/*`) is what keeps files movable:
 * an import survives a move because it names the module, not the location.
 * Test files are exempt — a colocated `*.test.ts` importing its sibling with
 * `./` is the deliberate pattern for exercising the file under test.
 *
 * Detects `from "./x"` / `from "../x"` specifiers only. A bare side-effect
 * `import "./x"` would be missed (there are none today) — recorded as a known
 * limitation in guardrails.config.json.
 *
 * Takes `[{ path, text }]` over src files; colocated `*.test.ts` files are
 * skipped internally.
 */
export function relativeImportsOutsideTests(files) {
  const out = [];
  for (const { path: rel, text } of files) {
    if (/[\\/]\.test\.ts$/.test(rel) || rel.endsWith(".test.ts")) continue; // colocated test of a sibling
    // Match lines that start with `import ... from` or `export ... from` where
    // the specifier is a relative path (`./` or `../`). The `^` with `m` flag
    // anchors to line start, so comments and string literals are excluded.
    for (const match of text.matchAll(/^(?:import|export)\s[\s\S]*?\bfrom\s+["'](\.[^"']+)["']/gm)) {
      out.push({ path: rel, spec: match[1] });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.spec.localeCompare(b.spec));
}

function walkFiles(dir, predicate, ignoreDirNames = []) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirNames.includes(entry.name)) continue;
      out.push(...walkFiles(full, predicate, ignoreDirNames));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

// --- inventories ------------------------------------------------------------

const INVENTORIES = [
  {
    file: "npm-dependencies.json",
    label: "npm dependencies",
    generatedBy: "node scripts/guardrails.mjs --update",
    severity: "error",
    rationale:
      "checkr is a published single-package library; a new dependency adds supply-chain and maintenance surface to every consumer and must be a deliberate, named decision.",
    collect: () => npmDependencies(readText("package.json")),
  },
  {
    file: "src-env-keys.json",
    label: "process.env keys read by src",
    generatedBy: "node scripts/guardrails.mjs --update",
    severity: "warn",
    rationale:
      "A library reading process.env at runtime ties behavior to deployment inputs. src/ reads none today. Warn-only: it should be noticed in review, not block a build.",
    collect: () =>
      envKeys(
        walkFiles(path.join(rootDir, "src"), (f) => f.endsWith(".ts") || f.endsWith(".tsx")).map(
          (f) => fs.readFileSync(f, "utf8"),
        ),
      ),
  },
];

// --- invariants -------------------------------------------------------------

/**
 * No src/lib file may import from a layer above its own (an invariant, not an
 * inventory: there is no baseline, so `--update` cannot launder a violation).
 */
function checkLibLayering(errors) {
  const files = walkFiles(path.join(rootDir, "src/lib"), (f) => f.endsWith(".ts")).map(
    (f) => ({ path: path.relative(rootDir, f).replace(/\\/g, "/"), text: fs.readFileSync(f, "utf8") }),
  );
  for (const { path: rel, target } of libLayerViolations(files)) {
    errors.push(
      `Upward src/lib import: ${rel} imports @lib/${target}\n` +
        "  The src/lib layers form a DAG — types < xml < xsd < validator, with core as the composition root.\n" +
        "  A layer may only import from its own layer and the layers below it; an upward import reintroduces the coupling the split exists to prevent.\n" +
        "  Move the shared piece down into a lower layer, or argue the new edge in an ADR and update LIB_LAYERS in scripts/guardrails.mjs with it.",
    );
  }
}

/**
 * No non-test src file may import a sibling relatively (an invariant, not an
 * inventory: there is no baseline, so `--update` cannot launder a violation).
 */
function checkRelativeImports(errors) {
  const files = walkFiles(path.join(rootDir, "src"), (f) => f.endsWith(".ts")).map(
    (f) => ({ path: path.relative(rootDir, f).replace(/\\/g, "/"), text: fs.readFileSync(f, "utf8") }),
  );
  for (const { path: rel, spec } of relativeImportsOutsideTests(files)) {
    errors.push(
      `Relative import in non-test source: ${rel} imports \`${spec}\`\n` +
        "  src/ imports through the @lib/* and @benchmark/* aliases (tsconfig paths), so a file survives a move without rewriting its imports.\n" +
        "  A relative specifier from non-test code breaks that: rewrite it as @lib/... or @benchmark/....",
    );
  }
}

// Everything above is side-effect free so `guardrails.test.mjs` can import the
// extractors. Running the check on import instead would `process.exit()` out of
// the test runner mid-suite — which silently reports the file as passing.
function main({ update }) {
  const errors = [];
  const warnings = [];

  for (const inventory of INVENTORIES) {
    const target = path.join(dataDir, inventory.file);
    const actual = inventory.collect();

    if (update) {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(
        target,
        `${JSON.stringify(
          {
            $comment: `${inventory.label}. ${inventory.rationale}`,
            generatedBy: inventory.generatedBy,
            entries: actual,
          },
          null,
          2,
        )}\n`,
      );
      process.stdout.write(`Baselined ${inventory.file} (${actual.length} entries).\n`);
      continue;
    }

    let baseline;
    try {
      baseline = JSON.parse(fs.readFileSync(target, "utf8")).entries;
    } catch (err) {
      errors.push(
        `Missing or unreadable guardrail baseline: scripts/guardrails/${inventory.file} (${err.message}). ` +
          `Regenerate with \`${inventory.generatedBy}\`.`,
      );
      continue;
    }

    const known = new Set(baseline);
    const present = new Set(actual);
    const added = actual.filter((entry) => !known.has(entry));
    // A baselined entry that is gone means the inventory is stale. Reported for
    // the same reason the design allowlists are: a list that only ever grows
    // stops describing the repo, and stops being reviewable.
    const removed = baseline.filter((entry) => !present.has(entry));

    const sink = inventory.severity === "warn" ? warnings : errors;
    for (const entry of added) {
      sink.push(
        `New ${inventory.label} entry not in the guardrail baseline: ${entry}\n` +
          `  ${inventory.rationale}\n` +
          `  If this addition is approved, rebase the baseline with \`${inventory.generatedBy}\` and say so in the change.`,
      );
    }
    for (const entry of removed) {
      sink.push(
        `Stale ${inventory.label} baseline entry (no longer present): ${entry}\n` +
          `  Rebase with \`${inventory.generatedBy}\` so the baseline keeps describing the repo.`,
      );
    }
  }

  // Invariants: there is no baseline to rebase, so `--update` cannot clear
  // them and they run in both modes.
  checkLibLayering(errors);
  checkRelativeImports(errors);

  for (const message of warnings) process.stdout.write(`GUARDRAILS_WARN: ${message}\n`);

  if (errors.length > 0) {
    for (const message of errors) process.stderr.write(`${message}\n`);
    process.stderr.write(
      "\nDo not edit scripts/guardrails/*.json or guardrails.config.json to make this pass. Report it.\n",
    );
    return 1;
  }

  if (!update) process.stdout.write("Guardrails passed.\n");
  return 0;
}

// Only run the check when invoked as a script. `node --test` imports this file
// for its extractors; exiting during that import reports the test file as a pass
// with zero tests run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main({ update: process.argv.includes("--update") }));
}
