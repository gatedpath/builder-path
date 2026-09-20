#!/usr/bin/env node
// Read the owner's edited text files and write her wording back into the site sources.
//
//   node scripts/apply-text.mjs            report what would change, write nothing
//   node scripts/apply-text.mjs --write    write it
//
// Reads "Website Text Edits/*.txt" and any "*-edits.txt" a browser session exported from the
// offline site. A block she has not touched is left byte-identical. A block she has edited is
// re-marked-up from the manifest's protected spans. A block is refused, named and not written when
// a protected span is gone from her text, when a FACT moved (a number, unit, date, version, command,
// path, or the order two of them come in; `--allow <markers>` when she says the change is meant), or
// when her text holds a character the page source would read as code. The decisions are pure
// functions in text-apply-lib.mjs, with tests.
//
// Nothing here re-runs the drift checks; do that afterwards with `npm run check:samples` and
// `node ../packages/agent-rules/dist/esm/cli.js --check`.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEdited, readOrigins } from './text-merge.mjs';
import { decideEdit, applyToLines } from './text-apply-lib.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(SITE, '..');
const EDITS = join(ROOT, 'Website Text Edits');
const WRITE = process.argv.includes('--write');
// --allow 6.7,2.11: the owner has said these blocks' facts are meant to change. Lifts the fact check
// for those markers only; a missing command or link, or a character that breaks the page, still refuses.
const allowAt = process.argv.indexOf('--allow');
const ALLOW = new Set(allowAt === -1 ? [] : (process.argv[allowAt + 1] ?? '').split(',').map((m) => m.trim()).filter(Boolean));

if (!existsSync(join(EDITS, 'manifest.json'))) {
  console.error(`No manifest at ${EDITS}. Run: node scripts/extract-text.mjs`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(EDITS, 'manifest.json'), 'utf8'));

/** marker -> block, across every page */
const byMarker = new Map();
for (const page of manifest.pages) {
  for (const b of page.blocks) byMarker.set(b.marker, b);
}

// ---------------------------------------------------------------- gather edits

const edited = new Map();   // marker -> text
const sources = new Map();  // marker -> which file it came from
const origins = new Map();  // marker -> the paragraph a browser edit was written for
for (const name of readdirSync(EDITS).sort()) {
  if (!name.endsWith('.txt') || name === 'README.txt') continue;
  const body = readFileSync(join(EDITS, name), 'utf8');
  const found = readEdited(body);
  const was = readOrigins(body);
  for (const [marker, text] of found) {
    if (!byMarker.has(marker)) { console.warn(`  unknown marker [${marker}] in ${name}, ignored`); continue; }
    // A later file wins, so an export from the offline site overrides the plain text draft.
    edited.set(marker, text);
    sources.set(marker, name);
    if (was.has(marker)) origins.set(marker, was.get(marker)); else origins.delete(marker);
  }
}

// ---------------------------------------------------------------- decide

const changes = new Map();   // file -> [{ block, md, marker }]
const refused = [];
let unchanged = 0;

for (const [marker, text] of edited) {
  const block = byMarker.get(marker);
  const d = decideEdit(block, text, { allow: ALLOW.has(marker), was: origins.get(marker) ?? null });
  if (d.status === 'unchanged') { unchanged += 1; continue; }
  if (d.status === 'refused') { refused.push({ marker, file: sources.get(marker), source: block.file, ...d }); continue; }
  if (!changes.has(block.file)) changes.set(block.file, []);
  changes.get(block.file).push({ block, md: d.md, marker });
}

// ---------------------------------------------------------------- write

const written = [];
const stale = [];

for (const [file, items] of changes) {
  const abs = join(SITE, file);
  const lines = readFileSync(abs, 'utf8').split('\n');

  // Bottom-up, so a replacement that changes the line count never moves a block above it.
  items.sort((a, b) => b.block.startLine - a.block.startLine);

  const applied = [];
  for (const { block, md, marker } of items) {
    const r = applyToLines(lines, block, md);
    if (!r.ok) { stale.push({ marker, source: file, current: r.stale }); continue; }
    applied.push(marker);
  }

  if (applied.length) {
    if (WRITE) writeFileSync(abs, lines.join('\n'));
    written.push({ file, count: applied.length, markers: applied.reverse() });
  }
}

// ---------------------------------------------------------------- report

console.log(`apply-text  ${WRITE ? '(writing)' : '(dry run, nothing written)'}`);
console.log(`  read ${edited.size} blocks from "Website Text Edits"`);
console.log(`  ${unchanged} unchanged, ${written.reduce((n, w) => n + w.count, 0)} to apply, ${refused.length} refused, ${stale.length} stale`);
console.log('');

if (written.length) {
  console.log('Changed:');
  for (const w of written) console.log(`  ${w.file}  ${w.count} block(s): ${w.markers.join(', ')}`);
  console.log('');
}

if (refused.length) {
  console.log('Refused: nothing below was written.');
  for (const r of refused) {
    console.log(`  [${r.marker}] in ${r.file}  ->  ${r.source}`);
    for (const reason of r.reasons) console.log(`     ${reason}`);
    for (const f of r.facts) {
      if (f.kind === 'lost') console.log(`     a fact is gone or changed: "${f.token}" (${f.was} before, ${f.now} now)`);
      else if (f.kind === 'added') console.log(`     a fact appeared: "${f.token}" (${f.was} before, ${f.now} now)`);
      else console.log(`     the facts are in a different order: "${f.token}" now sits where "${f.with}" was`);
    }
    console.log(`     your text: ${r.text.slice(0, 120)}${r.text.length > 120 ? '…' : ''}`);
  }
  console.log('  A missing word: put the exact word back. A fact: if the change is meant, say so and it is');
  console.log(`  applied with --allow ${refused.filter((r) => r.facts.length).map((r) => r.marker).join(',') || '<marker>'}. A character that reads as code: reword around it.`);
  console.log('');
}

if (stale.length) {
  console.log('Stale: the page source has moved on since the text was extracted.');
  for (const s of stale) console.log(`  [${s.marker}] ${s.source}: now reads "${s.current}"`);
  console.log('  Re-run extract-text.mjs (it keeps files you have edited) and re-apply.');
  console.log('');
}

if (WRITE && written.length) {
  console.log('Next: npm run check:samples, then rebuild the offline site.');
}
if (!WRITE && written.length) {
  console.log('Run again with --write to apply.');
}
process.exit(refused.length || stale.length ? 1 : 0);
