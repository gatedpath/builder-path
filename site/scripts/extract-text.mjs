#!/usr/bin/env node
// Write the site's prose out as plain text files the owner can edit in any text editor.
//
//   node scripts/extract-text.mjs
//
// Writes "Website Text Edits/" at the project root: one .txt per page, a README, and a manifest
// that remembers where every block came from. Run apply-text.mjs afterwards to write her wording
// back into the sources.
//
// Re-running is safe. Whether she edited a block is judged against what she was last given (the
// previous manifest), never against today's page source; see text-merge.mjs for why. A file with
// none of her edits is refreshed; her edits are carried into a refreshed file when the page moved
// on around them; where she and a session changed the same block, the page's text goes in the file
// and her wording is saved beside it in a .conflicts.md note. --force discards her edits.

import { readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMdx, parseAstro, parseData } from './text-lib.mjs';
import { planFile } from './text-merge.mjs';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(SITE, '..');
const OUT = join(ROOT, 'Website Text Edits');
const FORCE = process.argv.includes('--force');

const KIND_LABEL = {
  description: 'PAGE SUMMARY  (shown in search results and link previews, not on the page)',
  heading: 'HEADING',
  paragraph: 'TEXT',
  listItem: 'BULLET',
  element: 'TEXT',
  prop: 'CARD TEXT',
  dataField: 'DESCRIPTION',
};

/** The pages, in the order they appear in the site's sidebar, with the names she will recognise. */
const PAGES = [
  { slug: 'front-page', url: '/', title: 'Front page', sources: ['src/components/Landing.astro', 'src/components/TwoSpeed.astro'] },
  { slug: 'start', url: '/start/', title: 'Start: the golden path', sources: ['src/content/docs/start.mdx', 'src/data/tips.ts'] },
  { slug: 'agents', url: '/agents/', title: 'Bring your own agent', sources: ['src/content/docs/agents.mdx'] },
  { slug: 'tools', url: '/tools/', title: 'Tools', sources: ['src/content/docs/tools.mdx', 'src/data/tools.ts'] },
  { slug: 'identity', url: '/identity/', title: 'Identity for builders', sources: ['src/content/docs/identity.mdx'] },
  { slug: 'review', url: '/review/', title: 'Review before mainnet', sources: ['src/content/docs/review.mdx'] },
  { slug: 'errors', url: '/errors/', title: 'When something fails', sources: ['src/content/docs/errors.mdx'] },
  { slug: 'operate', url: '/operate/', title: 'Operate', sources: ['src/content/docs/operate.mdx'] },
  { slug: 'tutorials', url: '/tutorials/', title: 'Tutorials', sources: ['src/content/docs/tutorials.mdx', 'src/data/cards.ts'] },
  { slug: 'status', url: '/status/', title: 'Network status', sources: ['src/content/docs/status.mdx'] },
  { slug: 'research', url: '/research/', title: 'Research', sources: ['src/content/docs/research.mdx'] },
  { slug: 'concepts', url: '/concepts/', title: 'Concepts: overview', sources: ['src/content/docs/concepts/index.mdx'] },
  { slug: 'concepts-identity-gate', url: '/concepts/identity-gate/', title: 'Concepts: the identity gate', sources: ['src/content/docs/concepts/identity-gate.mdx'] },
  { slug: 'concepts-consensus', url: '/concepts/consensus-and-finality/', title: 'Concepts: consensus and finality', sources: ['src/content/docs/concepts/consensus-and-finality.mdx'] },
  { slug: 'concepts-blocks', url: '/concepts/blocks-on-demand/', title: 'Concepts: blocks on demand', sources: ['src/content/docs/concepts/blocks-on-demand.mdx'] },
  { slug: 'concepts-gas', url: '/concepts/gas-model/', title: 'Concepts: the gas model', sources: ['src/content/docs/concepts/gas-model.mdx'] },
  // Project pages go at the end, always: a page added in the middle renumbers every file after it,
  // and the owner's folder is then full of files the manifest no longer knows.
  { slug: 'project-change-the-gate', url: '/tutorials/change-the-gate/', title: 'Project 1: Change the gate', sources: ['src/content/docs/tutorials/change-the-gate.mdx'] },
  { slug: 'project-pages-shared', url: '/tutorials/tokenised-bond/', title: 'Project pages: the words every project shares', sources: ['src/components/ProjectStepMake.astro', 'src/components/SaveYourWork.astro', 'src/components/ProjectGeneric.astro', 'src/components/ProjectStepPreflight.astro'] },
  // Added 17 September 2026, after the project pages, for the same reason: never renumber her files.
  { slug: 'solidity', url: '/solidity/', title: 'Writing Solidity: the path', sources: ['src/content/docs/solidity/index.mdx'] },
  { slug: 'solidity-1-gate-a-function', url: '/solidity/gate-a-function/', title: 'Writing Solidity 1: Gate a function', sources: ['src/content/docs/solidity/gate-a-function.mdx'] },
  { slug: 'solidity-2-test-five-states', url: '/solidity/test-five-states/', title: 'Writing Solidity 2: Test all five states', sources: ['src/content/docs/solidity/test-five-states.mdx'] },
  { slug: 'solidity-3-the-gated-token', url: '/solidity/the-gated-token/', title: 'Writing Solidity 3: Read the gated token', sources: ['src/content/docs/solidity/the-gated-token.mdx'] },
  { slug: 'solidity-4-deploy-and-refusals', url: '/solidity/deploy-and-refusals/', title: 'Writing Solidity 4: Deploy, and be refused', sources: ['src/content/docs/solidity/deploy-and-refusals.mdx'] },
  { slug: 'solidity-5-admin-safe-and-timelock', url: '/solidity/admin-safe-and-timelock/', title: 'Writing Solidity 5: Safe and timelock', sources: ['src/content/docs/solidity/admin-safe-and-timelock.mdx'] },
  { slug: 'solidity-6-gas-in-dollars', url: '/solidity/gas-in-dollars/', title: 'Writing Solidity 6: Price it in dollars', sources: ['src/content/docs/solidity/gas-in-dollars.mdx'] },
  { slug: 'agents-say-what-you-want', url: '/agents-guide/say-what-you-want/', title: 'Directing an agent: Say what you want', sources: ['src/content/docs/agents-guide/say-what-you-want.mdx'] },
  { slug: 'agents-read-what-comes-back', url: '/agents-guide/read-what-comes-back/', title: 'Directing an agent: Read what comes back', sources: ['src/content/docs/agents-guide/read-what-comes-back.mdx'] },
  { slug: 'agents-what-never-goes-in', url: '/agents-guide/what-never-goes-in/', title: 'Directing an agent: What never goes into an agent', sources: ['src/content/docs/agents-guide/what-never-goes-in.mdx'] },
  { slug: 'project-2-prove-the-pause', url: '/tutorials/prove-the-pause/', title: 'Project 2: Prove the pause', sources: ['src/content/docs/tutorials/prove-the-pause.mdx'] },
  { slug: 'project-3-explain-the-missing-code', url: '/tutorials/explain-the-missing-code/', title: 'Project 3: Explain the missing code', sources: ['src/content/docs/tutorials/explain-the-missing-code.mdx'] },
  { slug: 'project-4-break-it-on-purpose', url: '/tutorials/break-it-on-purpose/', title: 'Project 4: Break it on purpose', sources: ['src/content/docs/tutorials/break-it-on-purpose.mdx'] },
  // Added 18 September 2026, at the end as always.
  { slug: 'project-5-tokenised-bond', url: '/tutorials/tokenised-bond/', title: 'Project 5: Tokenised bond', sources: ['src/content/docs/tutorials/tokenised-bond.mdx'] },
];

function parseSource(rel) {
  const abs = join(SITE, rel);
  if (!existsSync(abs)) return [];
  if (rel.endsWith('.mdx') || rel.endsWith('.md')) return parseMdx(abs, SITE);
  if (rel.endsWith('.astro')) return parseAstro(abs, SITE);
  if (rel.endsWith('.ts')) return parseData(abs, SITE);
  return [];
}

function wrap(text, width = 92) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if (line && line.length + 1 + word.length > width) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out.join('\n');
}

const manifest = { generated: new Date().toISOString().slice(0, 10), pages: [] };
mkdirSync(OUT, { recursive: true });

/** What she was last given, page by page. Without it there is nothing to judge an edit against. */
const previous = new Map();
if (existsSync(join(OUT, 'manifest.json'))) {
  try {
    for (const page of JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')).pages) previous.set(page.file, page.blocks);
  } catch { /* an unreadable manifest is the same as none */ }
}

const bar = '='.repeat(88);

function render(page, n, blocks) {
  const lines = [];
  lines.push(bar);
  lines.push(`  ${page.title.toUpperCase()}`);
  lines.push(`  Page ${n} of ${PAGES.length}`);
  lines.push(bar);
  lines.push('');
  lines.push('  Edit the words under each marker. Keep the markers on their own lines.');
  lines.push('  Leave anything inside curly braces { } exactly as it is: those are live numbers.');
  lines.push('  Technical words (commands, addresses, page names) must survive word for word.');
  lines.push('  README.txt in this folder has the full rules and what happens next.');
  lines.push('');
  for (const b of blocks) {
    lines.push('');
    lines.push(`[${b.marker}]  ${KIND_LABEL[b.kind] ?? b.kind.toUpperCase()}`);
    lines.push(wrap(b.text));
  }
  lines.push('');
  lines.push(bar);
  lines.push(`  End of ${page.title}. ${blocks.length} blocks.`);
  lines.push(bar);
  lines.push('');
  return lines.join('\n');
}

// First decide everything, then write. A run that has to stop must stop before it has moved the
// manifest, or the files and the manifest disagree and the writer-back acts on the difference.
const plans = [];
PAGES.forEach((page, pageIndex) => {
  const n = pageIndex + 1;
  const blocks = [];
  for (const rel of page.sources) {
    for (const b of parseSource(rel)) blocks.push(b);
  }
  if (!blocks.length) { console.warn(`  no prose found for ${page.slug}`); return; }
  const pageBlocks = blocks.map((b, k) => ({ ...b, marker: `${n}.${k + 1}` }));
  const name = `${String(n).padStart(2, '0')}-${page.slug}.txt`;
  const path = join(OUT, name);
  const plan = existsSync(path) && !FORCE
    ? planFile({ oldBlocks: previous.get(name) ?? null, newBlocks: pageBlocks, onDisk: readFileSync(path, 'utf8') })
    : { action: 'write', blocks: pageBlocks.map((b) => ({ ...b, sourceText: b.text })), carried: [], conflicts: [], unknown: [] };
  // With no earlier manifest the old rule is all there is: a file that differs is left alone.
  if (plan.action === 'keep' && !previous.has(name) && readFileSync(path, 'utf8') === render(page, n, pageBlocks)) plan.action = 'current';
  plans.push({ page, n, name, path, pageBlocks, plan });
});

// An export from the offline site, or any other loose .txt, carries markers issued against the
// previous pages. If the pages have moved, those markers may now name different paragraphs.
const generated = new Set(plans.map((p) => p.name));
const loose = readdirSync(OUT).filter((f) => f.endsWith('.txt') && f !== 'README.txt' && !generated.has(f));
const pagesMoved = plans.some((p) => p.plan.action === 'refresh' || p.plan.action === 'merge');
if (loose.length && pagesMoved && !FORCE) {
  console.error(`extract-text: stopped, nothing written.`);
  console.error(`  ${loose.join(', ')} holds edits whose markers belong to the pages as they were,`);
  console.error('  and the pages have changed since. Apply it first (npm run text:apply -- --write),');
  console.error('  move it out of the folder, then run this again.');
  process.exit(1);
}

let written = 0;
let skipped = 0;
let blockTotal = 0;

for (const { page, n, name, path, pageBlocks, plan } of plans) {
  if (plan.action === 'keep') {
    console.log(`  kept your edits: ${name}  (${plan.carried.length || 'some'} block(s); use --force to discard them)`);
    skipped += 1;
  } else {
    writeFileSync(path, render(page, n, plan.blocks));
    written += 1;
    if (plan.action === 'refresh') console.log(`  refreshed from the page: ${name}  (none of your edits were in it)`);
    if (plan.action === 'merge') {
      console.log(`  refreshed with your edits carried over: ${name}  (${plan.carried.map((c) => (c.marker === c.newMarker ? `[${c.marker}]` : `[${c.marker}] now [${c.newMarker}]`)).join(', ') || 'none carried'})`);
    }
  }
  if (plan.conflicts.length) {
    const note = join(OUT, name.replace(/\.txt$/, '.conflicts.md'));
    const body = [
      `# ${page.title}: your wording that could not be carried over (${manifest.generated})`,
      '',
      'The page changed these same paragraphs after you were given them, so the file now shows the',
      "page's new text. Your wording is kept here. Rework it against the new text in the .txt file if",
      'you still want it; nothing else in your file was lost.',
      '',
      ...plan.conflicts.flatMap((c) => [`## Was [${c.marker}]`, '', 'What you were given:', '', `> ${c.was}`, '', 'What you wrote:', '', `> ${c.hers}`, '']),
    ].join('\n');
    writeFileSync(note, body);
    console.log(`  ! ${plan.conflicts.length} of your edit(s) in ${name} met a changed paragraph; your wording is saved in ${name.replace(/\.txt$/, '.conflicts.md')}`);
  }
  if (plan.unknown.length) console.warn(`  unknown marker(s) in ${name}, ignored: ${plan.unknown.map((m) => `[${m}]`).join(', ')}`);

  // The manifest always records the page's own text; her wording lives only in her file, and the
  // difference between the two is how the writer-back knows a block is hers.
  manifest.pages.push({ n, slug: page.slug, url: page.url, title: page.title, file: name, sources: page.sources, blocks: pageBlocks });
  blockTotal += pageBlocks.length;
}

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const readme = `WEBSITE TEXT EDITS
==================

This folder is the site's words, in plain text, for you to rewrite in your own voice.

One .txt file per page, numbered in the order the pages appear on the site. Open any of
them in TextEdit or any editor and change the wording. Nothing here is code.


HOW IT WORKS
------------

Each block of text sits under a marker like [5.12]. The marker says which page and which
block, so your wording can be put back in the right place afterwards.

    [5.12]  TEXT
    The chain is finished enough. What grows transactions from here is ...

Rewrite the words under the marker. You can use as many lines as you like; the line
breaks do not matter, only the words.


THE FOUR RULES
--------------

1. Leave the [5.12] markers alone, on their own lines.

2. Leave anything inside curly braces exactly as it is, for example {formatDate(FACTS_VERIFIED)}.
   Those are live numbers the page fills in when it loads.

3. Technical words have to survive word for word: commands, file names, addresses,
   chain IDs, page names that are links, and anything that was code on the page. You can
   move them in the sentence and write around them freely, but do not reword them. If one
   goes missing, that block is refused and reported rather than written, so nothing breaks
   quietly.

4. Do not change a number, a date, a time or a measurement, written in figures or in words
   ("fourteen tools"), or swap the order two of them come in. Everything on this site is
   something that was actually run and recorded. The words are yours; the facts are not.
   Since 19 September 2026 this is checked when your words are written back: a block where a
   fact moved is refused and named, and nothing in it is written. If the change is meant
   (a fact really is wrong), say so, and it is applied for that block.

5. Three characters read as code in the page source and are refused if you add them: a curly
   brace, a less-than sign and a backslash. In a card title on the front page, use single or
   curly quotes rather than a double quote. A paragraph must not begin with the word "import"
   or "export".


WHAT IS NOT IN HERE
-------------------

Code samples, commands, tables of data, and the "for agents" fact lists at the top of each
page. Those are either extracted from files that get compiled, or written for machines
rather than readers, so they are not yours to reword and changing them would break a check.


WHEN YOU ARE DONE
-----------------

Tell Claude the edits are ready. It runs:

    node site/scripts/apply-text.mjs

which reads these files, writes your wording into the real page sources, re-runs the drift
checks, and prints a report of anything it refused and why. Your original files stay here.


IF A PAGE CHANGES WHILE YOU ARE EDITING
---------------------------------------

Sometimes a fact on a page has to be corrected while your edits are still in progress. Your
files are then refreshed so they show the corrected page, and your wording is carried into
the refreshed file, even if the marker numbers have shifted.

If a paragraph you rewrote is one that was also corrected, the file shows the corrected text
and your version is saved beside it in a note named like 06-review.conflicts.md, with what
you were given and what you wrote. Nothing of yours is thrown away. Rework it against the new
text if you still want it, then delete the note.


THE OTHER WAY TO EDIT
---------------------

"Website Offline" beside this folder is the whole site as files you can open in a browser
with no internet. Every page there has an "Edit text" button in the corner. Turn it on, click
a paragraph, retype it, and press "Save my edits". It downloads a file in the same format as
these, which goes in this folder and is applied the same way. Use whichever suits the moment:
the offline site to see the words in place, these files to work through a page end to end.

About nine in ten blocks can be edited in the browser. Three kinds cannot, and they are here
in the text files only:

  - the PAGE SUMMARY at the top of each file, which is never printed on the page itself;
  - a handful of sentences that carry a number the page works out as it loads, such as the
    measured window on the status page;
  - the twelve prompt-card summaries on the tutorials page, which the page prints behind a
    fixed label.


Generated ${manifest.generated} from the site sources. ${blockTotal} blocks across ${PAGES.length} pages.
`;
writeFileSync(join(OUT, 'README.txt'), readme);

console.log(`extract-text: ${blockTotal} blocks across ${manifest.pages.length} pages`);
console.log(`  wrote ${written} file(s), left ${skipped} edited file(s) alone`);
console.log(`  ${OUT}`);
