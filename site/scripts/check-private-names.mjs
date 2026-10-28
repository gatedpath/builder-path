#!/usr/bin/env node
// The visitor's test: nothing on a built page names a file a stranger cannot open. The owner's
// rule of 30 September 2026: "always imagine this whole site as a third-party visitor and never
// reveal our files". The private repository's working files (CLAUDE.md at the root, HANDOVER.md,
// PLAN.md, RESEARCH.md, PUBLISHING.md, YOUR-LIST, ideas/, owner/, setup/, research/) never reach
// the public copy, so a mention of one on a page is a pointer into nothing, and sometimes a hint
// at what was kept private.
//
// Prose is judged strictly: one mention fails the build. Code samples are reported but do not
// fail here: they are extracted from package sources that are public on npm and GitHub, and the
// public README already says their comments mention planning notes; scrubbing them is a package
// release, not a site edit. "CLAUDE.md" on its own is allowed everywhere, because the product's
// rules file for a builder's agent has that name; only "the project's CLAUDE.md" and the like fail.
//   node scripts/check-private-names.mjs        (after a build; reads dist/)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(site, 'dist');
const PRIVATE = /\b(HANDOVER\.md|PLAN\.md|RESEARCH\.md|PUBLISHING\.md|YOUR-LIST[\w-]*\.md|the project'?s `?CLAUDE\.md|\bideas\/|\bowner\/|\bsetup\/|\bresearch\/[\w-]+\.md)/g;

function pages(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (e.endsWith('.html')) out.push(p);
  }
  return out;
}
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x22;|&quot;/g, '"').replace(/&#x60;/g, '`').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

let proseHits = 0, codeHits = 0;
for (const file of pages(dist)) {
  const html = readFileSync(file, 'utf8');
  const page = '/' + relative(dist, file).replace(/index\.html$/, '');
  const code = [...html.matchAll(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/g)].map((m) => m[0]).join('\n');
  // Copy buttons carry the whole code sample in an attribute, and a sample can hold a literal "<",
  // which defeats a naive tag stripper; so buttons go first, whole.
  const prose = html.replace(/<button[\s\S]*?<\/button>/g, ' ').replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ');
  for (const m of text(prose).matchAll(PRIVATE)) {
    proseHits += 1;
    const at = m.index ?? 0; const t = text(prose);
    console.log(`PROSE  ${page}  …${t.slice(Math.max(0, at - 70), at + m[0].length + 40).trim()}…`);
  }
  const inCode = [...text(code).matchAll(PRIVATE)].length;
  if (inCode) { codeHits += inCode; console.log(`code   ${page}  ${inCode} mention(s) inside code samples (from package sources)`); }
}
console.log(`check-private-names: ${proseHits} in prose (must be 0), ${codeHits} inside code samples (reported only)`);
process.exit(proseHits ? 1 : 0);
