#!/usr/bin/env node

/**
 * validate-brief.mjs — task-brief validator.
 *
 * Usage:
 *   node scripts/validate-brief.mjs           # full audit: scans all briefs
 *   node scripts/validate-brief.mjs --gate     # gate mode: checks only changed files
 *   node scripts/validate-brief.mjs <file>     # validate a single brief
 *
 * Checks:
 *   - Required frontmatter fields present
 *   - No duplicate IDs (across all briefs)
 *   - Required sections present
 *   - At least one acceptance-criteria bullet
 *   - status: done requires non-empty Decision/Outcome and Verification
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const BACKLOG = resolve(root, "docs/backlog");
const ACTIVE = resolve(BACKLOG, "active");
const ARCHIVE = resolve(BACKLOG, "archive");

const REQUIRED_FRONTMATTER = [
  "id", "title", "area", "priority", "status", "depends_on",
  "required_context", "optional_context", "estimate",
];

const REQUIRED_SECTIONS = [
  "Context", "Deliver", "Acceptance Criteria", "Verification",
];

// --------------------------------------------------------------------------
// Parse a single brief file
// --------------------------------------------------------------------------

function parseBrief(filePath) {
  // Normalize line endings: the repo's briefs are committed as LF, but a
  // Windows checkout (core.autocrlf=true) materializes CRLF everywhere, which
  // would break every `\n`-anchored regex below. Treat both alike.
  const text = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const errors = [];
  const warnings = [];

  // --- Frontmatter ---
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) {
    errors.push("Missing or malformed frontmatter (must be --- delimited)");
    return { errors, warnings, id: null, status: null };
  }

  const fmText = fmMatch[1];
  const fm = {};
  for (const line of fmText.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Briefs quote their scalar values (`area: "meta"`); strip the quotes so
    // membership checks (area/priority/status) and the done-gate see the raw
    // value. Arrays (`depends_on: [...]`) are left untouched.
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }

  for (const field of REQUIRED_FRONTMATTER) {
    if (!(field in fm) || fm[field] === "") {
      // depends_on, required_context, optional_context can be empty arrays
      if (field === "depends_on" || field === "required_context" || field === "optional_context") {
        if (!(field in fm)) errors.push(`Missing frontmatter field: ${field}`);
      } else {
        errors.push(`Missing or empty frontmatter field: ${field}`);
      }
    }
  }

  if (fm.area && !["core", "validator", "xsd", "xml", "benchmark", "ops", "meta"].includes(fm.area)) {
    warnings.push(`Unrecognised area: "${fm.area}"`);
  }

  if (fm.priority && !["critical", "high", "medium", "low"].includes(fm.priority)) {
    warnings.push(`Unrecognised priority: "${fm.priority}"`);
  }

  if (fm.status && !["draft", "in-progress", "review", "done", "cancelled", "superseded"].includes(fm.status)) {
    warnings.push(`Unrecognised status: "${fm.status}"`);
  }

  // --- Sections ---
  for (const section of REQUIRED_SECTIONS) {
    const sectionRegex = new RegExp(`^## ${section}$`, "m");
    if (!sectionRegex.test(text)) {
      errors.push(`Missing required section: ## ${section}`);
    }
  }

  // --- Acceptance Criteria bullets ---
  const acMatch = text.match(/^## Acceptance Criteria\n\n([\s\S]*?)(?=\n## |$)/m);
  if (acMatch) {
    const acBody = acMatch[1];
    const bullets = acBody.split("\n").filter(l => l.trim().startsWith("- [ ]"));
    if (bullets.length === 0) {
      errors.push("Acceptance Criteria must have at least one bullet (- [ ])");
    }
  }

  // --- status: done requires Decision/Outcome and Verification ---
  if (fm.status === "done") {
    const hasOutcome = /^## Decision \/ Outcome\n\n(?!\s*$)/m.test(text);
    const hasVerification = /^## Verification\n\n(?!\s*$)/m.test(text);
    // More thorough: check there's content after the heading
    const outcomeMatch = text.match(/^## Decision \/ Outcome\n\n([\s\S]*?)(?=\n## |$)/m);
    const verificationMatch = text.match(/^## Verification\n\n([\s\S]*?)(?=\n## |$)/m);
    if (!outcomeMatch || outcomeMatch[1].trim().length === 0) {
      errors.push("status: done requires a non-empty Decision/Outcome section");
    }
    if (!verificationMatch || verificationMatch[1].trim().length === 0) {
      errors.push("status: done requires a non-empty Verification section");
    }
  }

  return { errors, warnings, id: fm.id || null, status: fm.status || null };
}

// --------------------------------------------------------------------------
// Collect all briefs
// --------------------------------------------------------------------------

function collectBriefs() {
  const files = [];
  for (const dir of [ACTIVE, ARCHIVE]) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (entry.endsWith(".md")) {
        files.push(resolve(dir, entry));
      }
    }
  }
  return files;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const isGate = args.includes("--gate");
  const explicitFiles = args.filter(a => !a.startsWith("--"));

  let files;
  if (explicitFiles.length > 0) {
    files = explicitFiles;
  } else {
    files = collectBriefs();
  }

  if (files.length === 0) {
    if (isGate) {
      console.log("VALIDATE_PASS (0s) — no briefs changed");
      process.exit(0);
    }
    // Full audit with no briefs at all is fine
    console.log("VALIDATE_PASS (0s) — no briefs to validate");
    process.exit(0);
  }

  let allErrors = [];
  let allWarnings = [];
  let seenIds = new Map();

  for (const file of files) {
    const { errors, warnings, id } = parseBrief(file);
    for (const e of errors) allErrors.push(`  ${file}: ${e}`);
    for (const w of warnings) allWarnings.push(`  ${file}: ${w}`);

    if (id) {
      if (seenIds.has(id)) {
        allErrors.push(`  Duplicate ID "${id}" in ${file} and ${seenIds.get(id)}`);
      }
      seenIds.set(id, file);
    }
  }

  // In gate mode, only report errors (not warnings) so CI can be strict
  if (allErrors.length > 0) {
    console.error("Brief validation errors:");
    for (const e of allErrors) console.error(e);
    if (allWarnings.length > 0) {
      console.error("\nWarnings:");
      for (const w of allWarnings) console.error(w);
    }
    console.log("VALIDATE_FAIL (0s)");
    process.exit(1);
  }

  if (allWarnings.length > 0 && !isGate) {
    console.log("Warnings:");
    for (const w of allWarnings) console.log(w);
  }

  console.log("VALIDATE_PASS (0s)");
  process.exit(0);
}

main();