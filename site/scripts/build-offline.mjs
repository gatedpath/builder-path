#!/usr/bin/env node
// Build the site as a folder the owner can open from her Mac with no server and no internet,
// with an "Edit text" button on every page.
//
//   node scripts/build-offline.mjs            build the site, then the offline folder
//   node scripts/build-offline.mjs --no-build use the dist/ that is already there
//
// Writes "Website Offline/" at the project root. Two things make a normal build work from a
// folder on disk: every absolute URL becomes a relative one (a file:// page has no site root),
// and every directory URL gains its index.html (there is no server to add it). The editor is
// injected here and only here; it is never part of a published build.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(SITE, '..');
const DIST = join(SITE, 'dist');
const OUT = join(ROOT, 'Website Offline');
const EDITS = join(ROOT, 'Website Text Edits');
const NO_BUILD = process.argv.includes('--no-build');

// ---------------------------------------------------------------- build

if (!NO_BUILD) {
  console.log('building the site...');
  execFileSync('npm', ['run', 'build'], { cwd: SITE, stdio: ['ignore', 'ignore', 'inherit'] });
}
if (!existsSync(DIST)) {
  console.error('No dist/. Run without --no-build.');
  process.exit(2);
}

// ---------------------------------------------------------------- blocks per page

let manifest = null;
if (existsSync(join(EDITS, 'manifest.json'))) {
  manifest = JSON.parse(readFileSync(join(EDITS, 'manifest.json'), 'utf8'));
} else {
  console.warn('  no manifest in "Website Text Edits"; the offline site will have no editor.');
}
const byUrl = new Map();
for (const page of manifest?.pages ?? []) {
  byUrl.set(page.url, {
    n: page.n,
    slug: page.slug,
    title: page.title,
    blocks: page.blocks.map((b) => ({ marker: b.marker, text: b.text })),
  });
}

// ---------------------------------------------------------------- copy

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(DIST, OUT, { recursive: true });

const editorJs = readFileSync(join(SITE, 'src/offline/rb-editor.js'), 'utf8');
const editorCss = readFileSync(join(SITE, 'src/offline/rb-editor.css'), 'utf8');
writeFileSync(join(OUT, 'rb-editor.js'), editorJs);
writeFileSync(join(OUT, 'rb-editor.css'), editorCss);

// ---------------------------------------------------------------- rewrite

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(OUT);
const htmlFiles = files.filter((f) => f.endsWith('.html'));

/** "/start/" -> "start/index.html", relative to a page at `depth` folders down. */
function toRelative(url, prefix) {
  const [path, hash = ''] = url.split('#');
  let target = path;
  if (target === '/') target = 'index.html';
  else {
    target = target.replace(/^\//, '');
    if (target.endsWith('/')) target += 'index.html';
  }
  return `${prefix}${target}${hash ? `#${hash}` : ''}`;
}

let rewritten = 0;
let editored = 0;
let noBlocks = [];

for (const file of htmlFiles) {
  const rel = relative(OUT, file);
  const depth = rel.split(sep).length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  let html = readFileSync(file, 'utf8');

  // attribute URLs: href, src, action. Leave protocol-relative and external alone.
  html = html.replace(/\b(href|src|action)="(\/(?!\/)[^"]*)"/g, (_m, attr, url) => `${attr}="${toRelative(url, prefix)}"`);
  // url(/...) inside the inlined stylesheets, mostly the self-hosted fonts
  html = html.replace(/url\((\/(?!\/)[^)"']*)\)/g, (_m, url) => `url(${prefix}${url.replace(/^\//, '')})`);
  // srcset entries
  html = html.replace(/\bsrcset="([^"]+)"/g, (m, set) => {
    if (!set.includes('/')) return m;
    const next = set.split(',').map((part) => {
      const t = part.trim();
      if (!t.startsWith('/') || t.startsWith('//')) return part;
      const [u, d] = t.split(/\s+/);
      return ` ${toRelative(u, prefix)}${d ? ` ${d}` : ''}`;
    }).join(',');
    return `srcset="${next.trim()}"`;
  });

  // the page's own blocks, then the editor
  const urlPath = `/${rel.replace(/index\.html$/, '').split(sep).join('/')}`;
  const page = byUrl.get(urlPath === '/' ? '/' : urlPath);
  if (manifest) {
    if (page) editored += 1;
    else if (!rel.startsWith('404')) noBlocks.push(urlPath);
  }

  const inject = [
    `<link rel="stylesheet" href="${prefix}rb-editor.css">`,
    page ? `<script>window.RB_PAGE=${JSON.stringify(page)}</script>` : '',
    `<script src="${prefix}rb-editor.js" defer></script>`,
  ].filter(Boolean).join('\n');

  if (html.includes('</head>')) html = html.replace('</head>', `${inject}\n</head>`);
  else html += inject;

  writeFileSync(file, html);
  rewritten += 1;
}

// ---------------------------------------------------------------- read me

const readme = `WEBSITE OFFLINE
===============

The whole builder site as files on your Mac. No internet, no server, nothing to install.

Open "index.html" in this folder and the site opens in your browser. Every link between
pages works. Read it exactly as a visitor would.


EDITING THE WORDS
-----------------

Every page has an "Edit text" button in the bottom right corner.

  1. Press it. The text you can change gets a faint outline.
  2. Click a paragraph, a heading or a bullet and retype it. Press Escape to undo that one.
  3. The counter in the bar says how many changes you have made, across all pages.
  4. Press "Save my edits" when you are done. It offers the file to download, and shows the
     text so you can copy it if the download does not work from a folder on disk.
  5. Put that file in the "Website Text Edits" folder beside this one, and tell Claude.

Your edits stay in the browser between visits, so you can stop and come back. They are only
in this browser though, so save the file before you finish for the day.

You can also edit the same words as plain text files in "Website Text Edits". Both ways
produce the same thing; use whichever suits the moment. The offline site is better for
seeing the words in place, the text files for working through a page end to end.


WHAT YOU CANNOT CHANGE HERE
---------------------------

Code blocks, commands, tables of data, and the "for agents" fact lists. Those come from files
that get compiled and checked, so they are not free text. Numbers, dates and measurements are
not yours to change either: everything on this site is something that was actually run and
recorded. The words are yours; the facts are not.

About nine in ten blocks can be edited here. The rest are in the text files only: each page's
summary line (which never appears on the page), a handful of sentences carrying a number the
page works out as it loads, and the twelve prompt-card summaries on the tutorials page. Nothing
is lost either way, since both roads lead to the same place.


TWO THINGS THAT DO NOT WORK FROM A FOLDER
------------------------------------------

Search, and a few small interactive bits (the theme switch, tabbed panels, the mobile
contents menu). They need to be served over http rather than opened as files, which a browser
will not do from disk for security reasons. Nothing about reading or editing the words is
affected.

If you ever want the full thing, run this in Terminal from inside this folder and open the
address it prints:

    python3 -m http.server 8000

Built ${new Date().toISOString().slice(0, 10)} from the site sources.
`;
writeFileSync(join(OUT, 'READ ME FIRST.txt'), readme);

// ---------------------------------------------------------------- check it holds together
//
// The folder is only useful if every link in it resolves without a server, so every relative
// URL is resolved against the file that carries it and checked on disk. One absolute URL left
// over, or one target missing, and the build fails rather than handing over a folder that
// half works.

let checked = 0;
const broken = [];
const absolute = [];
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const dir = dirname(file);
  const urls = [
    ...[...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/url\(([^)"']+)\)/g)].map((m) => m[1]),
  ];
  for (const u of urls) {
    if (/^(https?:|mailto:|data:|#|\/\/)/.test(u)) continue;
    if (u.startsWith('/')) { absolute.push(`${relative(OUT, file)} -> ${u}`); continue; }
    checked += 1;
    if (!existsSync(resolve(dir, u.split('#')[0]))) broken.push(`${relative(OUT, file)} -> ${u}`);
  }
}

console.log(`build-offline: ${rewritten} pages rewritten for file:// and ${editored} carrying the editor`);
console.log(`  ${checked} links checked, ${broken.length} broken, ${absolute.length} still absolute`);
if (noBlocks.length) console.log(`  no blocks for: ${noBlocks.join(', ')}`);
console.log(`  ${OUT}`);

if (broken.length || absolute.length) {
  for (const b of broken.slice(0, 10)) console.error(`  broken: ${b}`);
  for (const a of absolute.slice(0, 10)) console.error(`  absolute: ${a}`);
  process.exit(1);
}
