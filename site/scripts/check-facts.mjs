#!/usr/bin/env node
// Compare the edited text files against the manifest, and prove that only wording moved.
//
//   node scripts/check-facts.mjs
//
// A rewrite of the site's prose is allowed to change words. It is not allowed to change a number,
// a date, a measurement, a version, a chain id, an address, a command, a path or a file name. This
// pulls every one of those tokens out of both versions of each block and reports any that appeared,
// vanished or changed count. It is the check behind the promise the site makes about its own facts.
//
// The baseline is `manifest.json`, not git: the manifest holds each block's text exactly as it was
// read out of the source, keyed by the same marker, so it stays valid when a page gains or loses a
// block and does not care what has been committed.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEdited } from './text-merge.mjs';
import { factDiff } from './text-apply-lib.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(SITE, '..');
const EDITS = join(ROOT, 'Website Text Edits');

// The same rule and the same files as apply-text.mjs, which now refuses on it: this script is the
// report on its own, for reading before an apply. It used to read only the numbered page files, so
// an edit saved from the browser (offline-edits.txt) was never checked at all.
const manifest = JSON.parse(readFileSync(join(EDITS, 'manifest.json'), 'utf8'));
const original = new Map();
for (const page of manifest.pages) for (const b of page.blocks) original.set(b.marker, b.text.replace(/\s+/g, ' ').trim());

let blocksCompared = 0;
let blocksChanged = 0;
const problems = [];
for (const name of readdirSync(EDITS).sort()) {
  if (!name.endsWith('.txt') || name === 'README.txt') continue;
  for (const [marker, text] of readEdited(readFileSync(join(EDITS, name), 'utf8'))) {
    const before = original.get(marker);
    if (before === undefined) { problems.push({ marker, rel: name, kind: 'block added' }); continue; }
    blocksCompared += 1;
    const after = text.replace(/\s+/g, ' ').trim();
    if (after === before) continue;
    blocksChanged += 1;
    for (const f of factDiff(before, after)) problems.push({ marker, rel: name, ...f });
  }
}
if (blocksCompared === 0) {
  console.error('check-facts: no block was compared. Is "Website Text Edits" empty? Run: node scripts/extract-text.mjs');
  process.exit(2);
}

console.log('check-facts against the manifest');
console.log(`  ${blocksCompared} blocks compared, ${blocksChanged} reworded`);
console.log(`  ${problems.length} fact token(s) moved`);
if (problems.length) {
  console.log('');
  for (const p of problems) {
    const where = `${p.rel} [${p.marker}]`;
    if (p.kind === 'lost') console.log(`  LOST       ${where}  "${p.token}"  ${p.was} -> ${p.now}`);
    else if (p.kind === 'added') console.log(`  ADDED      ${where}  "${p.token}"  ${p.was} -> ${p.now}`);
    else if (p.kind === 'reordered') console.log(`  REORDERED  ${where}  "${p.token}" now sits where "${p.with}" was`);
    else console.log(`  ${p.kind.toUpperCase()}  ${where}`);
  }
  console.log('');
  console.log('  Each line is a number, unit, date, command, path or version that is not the same, in the same');
  console.log('  order, in both versions. apply-text.mjs refuses these blocks; --allow <markers> when it is meant.');
}
process.exit(problems.length ? 1 : 0);
