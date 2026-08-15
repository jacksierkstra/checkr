#!/usr/bin/env node

/**
 * agent-check — canonical verification for the checkr repo.
 *
 * Usage:
 *   node scripts/agent-check.mjs [target]
 *
 * Targets:
 *   full       — test, build, benchmark, validate-brief, guardrails (fail-fast order)
 *   test       — yarn test
 *   build      — yarn build
 *   benchmark  — yarn benchmark
 *   validate-brief — node scripts/validate-brief.mjs
 *   guardrails — node --test scripts/guardrails.test.mjs && node scripts/guardrails.mjs
 *
 * Every check prints exactly one line:
 *   NAME_PASS (Ns)   or   NAME_FAIL (Ns)
 *
 * No other output on success. On failure, the full command output is shown.
 * The first failing check causes an immediate non-zero exit. `full` prints an
 * AGENT_CHECK_FULL_PASS marker after the last check so a workflow script can
 * gate on the whole run.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function checkTool(name, shellCmd, hint) {
  try {
    execSync(shellCmd, { stdio: "ignore", timeout: 5000 });
  } catch {
    die(`REQUIRED_TOOL_MISSING: ${name}. ${hint}`);
  }
}

/**
 * Run a single shell command and report a deterministic PASS/FAIL marker.
 *
 * @param {string} label  Short uppercase name for the marker (e.g. "TEST")
 * @param {string} cmd    Shell command to run
 * @param {object} [opts]
 * @param {number} [opts.timeout]  Timeout in ms (default 120_000)
 * @returns {boolean}     true if the command exited 0
 */
function runOne(label, cmd, opts = {}) {
  const start = Date.now();
  const timeout = opts.timeout ?? 120_000;

  try {
    execSync(cmd, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      encoding: "utf-8",
    });
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`${label}_PASS (${elapsed}s)`);
    return true;
  } catch (e) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`${label}_FAIL (${elapsed}s)`);
    // Show the failure output so the agent can diagnose
    if (e.stdout) process.stdout.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
    return false;
  }
}

// --------------------------------------------------------------------------
// Check definitions
// --------------------------------------------------------------------------

const CHECK_ORDER = ["test", "build", "benchmark", "validate-brief", "guardrails"];

const CHECKS = {
  test:           () => runOne("TEST", "yarn test"),
  build:          () => runOne("BUILD", "yarn build"),
  benchmark:      () => runOne("BENCHMARK", "yarn benchmark", { timeout: 300_000 }),
  "validate-brief": () => runOne("VALIDATE", `node "${resolve(__dirname, "validate-brief.mjs")}"`),
  guardrails:     () =>
    runOne("GUARDRAILS", `node --test "${resolve(__dirname, "guardrails.test.mjs")}" && node "${resolve(__dirname, "guardrails.mjs")}"`),
};

// --------------------------------------------------------------------------
// Environment validation
// --------------------------------------------------------------------------

checkTool("node", "node --version", "Install Node.js 20+ from https://nodejs.org");
checkTool("yarn", "yarn --version", "Install Yarn 4.x: corepack enable && yarn set version 4.x");
checkTool("git", "git --version", "Install Git from https://git-scm.com");

if (!existsSync(resolve(root, "node_modules"))) {
  die("node_modules not found. Run: yarn install --immutable");
}

// --------------------------------------------------------------------------
// Target dispatch
// --------------------------------------------------------------------------

const target = process.argv[2] || "full";

if (target === "full") {
  for (const name of CHECK_ORDER) {
    if (!CHECKS[name]()) process.exit(1);
  }
  console.log("AGENT_CHECK_FULL_PASS");
  process.exit(0);
}

if (!CHECKS[target]) {
  die(`Unknown target: ${target}. Available: full, ${CHECK_ORDER.join(", ")}`);
}

const ok = CHECKS[target]();
process.exit(ok ? 0 : 1);