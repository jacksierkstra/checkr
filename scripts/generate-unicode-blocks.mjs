#!/usr/bin/env node
/**
 * Regenerates `src/lib/xsd/unicode-blocks.ts` from the Unicode Character
 * Database (UCD) Blocks file.
 *
 * Usage:
 *   node scripts/generate-unicode-blocks.mjs [version]
 *
 * The version defaults to the same Unicode version checkr documents as its
 * block-data target (see CHK-015 Decision/Outcome). The XSD regex dialect
 * (Part 2 Appendix E) references Unicode block names with spaces and hyphens
 * removed ("IsBasicLatin"); the generated table keys exactly that form.
 *
 * Network is required. The generated file is committed; this script exists so
 * the table's provenance and regeneration path are explicit.
 */

import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = process.argv[2] ?? "17.0.0";
const URL = `https://www.unicode.org/Public/${VERSION}/ucd/Blocks.txt`;
const OUT = resolve(__dirname, "..", "src", "lib", "xsd", "unicode-blocks.ts");

const response = await fetch(URL);
if (!response.ok) {
  console.error(`fetch failed: ${response.status} ${response.statusText} (${URL})`);
  process.exit(1);
}
const text = await response.text();

/** "0000..007F; Basic Latin" → { start, end, name } */
const blocks = [];
for (const line of text.split("\n")) {
  const m = /^([0-9A-F]+)\.\.([0-9A-F]+);\s*(.+)\s*$/.exec(line);
  if (!m) continue;
  const start = parseInt(m[1], 16);
  const end = parseInt(m[2], 16);
  // XSD BlockName = Unicode block name with spaces and hyphens removed.
  const name = m[3].replace(/[ -]/g, "");
  blocks.push({ start, end, name });
}

const body = blocks
  .map(({ start, end, name }) => `    ${JSON.stringify(name)}: [0x${start.toString(16)}, 0x${end.toString(16)}],`)
  .join("\n");

const output = `/**
 * Unicode block ranges — XSD regex \`\\p{Is...}\` block escapes (CHK-015).
 *
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *   node scripts/generate-unicode-blocks.mjs ${VERSION}
 *
 * Source: Unicode ${VERSION} UCD Blocks.txt
 *   ${URL}
 * Keyed by XSD BlockName form (Unicode block name with spaces and hyphens
 * removed, per XSD 1.0 Part 2 Appendix E). The target Unicode version is the
 * runtime's UCD (gap-analysis §5 policy: "whatever the JS engine provides").
 */
export const UNICODE_BLOCKS_VERSION = ${JSON.stringify(VERSION)};

export const UNICODE_BLOCKS: Readonly<Record<string, readonly [number, number]>> = {
${body}
};
`;

await writeFile(OUT, output, "utf8");
console.log(`wrote ${OUT} (${blocks.length} blocks, Unicode ${VERSION})`);
