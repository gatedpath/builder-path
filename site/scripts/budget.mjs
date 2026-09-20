// Client JavaScript per page, gzipped: every <script src> the page loads plus its inline
// scripts. Fails above 60 KB. Also reports HTML and CSS sizes. Writes reports/bundle.json.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative, resolve } from 'node:path';
import { siteDir } from './serve.mjs';

const LIMIT = 60 * 1024;
const dist = resolve(siteDir, 'dist');
const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const pages = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'pagefind' && name !== '_astro') walk(p); }
    else if (name === 'index.html' || name === '404.html') pages.push(p);
  }
}
walk(dist);
const rows = [];
let over = false;
for (const file of pages.sort()) {
  const html = readFileSync(file, 'utf8');
  const route = '/' + relative(dist, file).replace(/index\.html$/, '');
  const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  let js = 0;
  const parts = [];
  for (const src of scripts) {
    const local = resolve(dist, '.' + src);
    if (!existsSync(local)) continue;
    const size = gz(readFileSync(local));
    js += size;
    parts.push({ src, gzip: size });
  }
  const inlineJs = inline.reduce((n, s) => n + gz(Buffer.from(s)), 0);
  js += inlineJs;
  // Starlight's search script imports the Pagefind UI chunk on idle on every page that has
  // the search button, so it counts as client JS the page loads even though no tag names it.
  let idleJs = 0;
  if (html.includes('site-search')) {
    for (const name of readdirSync(resolve(dist, '_astro')).filter((n) => /^ui-core\..*\.js$/.test(n))) {
      const size = gz(readFileSync(resolve(dist, '_astro', name)));
      idleJs += size;
      parts.push({ src: '/_astro/' + name + ' (Pagefind UI, imported on idle)', gzip: size });
    }
  }
  js += idleJs;
  let css = inlineCss.reduce((n, s) => n + gz(Buffer.from(s)), 0);
  for (const href of styles) {
    const local = resolve(dist, '.' + href);
    if (existsSync(local)) css += gz(readFileSync(local));
  }
  const row = { route, htmlGzip: gz(Buffer.from(html)), jsGzip: js, inlineJsGzip: inlineJs, idleJsGzip: idleJs, cssGzip: css, scripts: parts };
  rows.push(row);
  if (js > LIMIT) over = true;
  console.log(`${route.padEnd(40)} html ${(row.htmlGzip / 1024).toFixed(1)} KB  js ${(js / 1024).toFixed(1)} KB  css ${(css / 1024).toFixed(1)} KB${js > LIMIT ? '  OVER BUDGET' : ''}`);
}
writeFileSync(resolve(siteDir, 'reports/bundle.json'), JSON.stringify({ ranAt: new Date().toISOString(), limitBytes: LIMIT, note: 'gzip level 9; js = every <script src> the page loads, its inline scripts, and the Pagefind UI chunk Starlight imports on idle; the Pagefind index itself loads only when a search is typed and is not counted; css = inline styles (all stylesheets are inlined at build)', rows }, null, 2) + '\n');
if (over) { console.error(`budget: a page exceeds ${LIMIT / 1024} KB of client JS`); process.exit(1); }
console.log(`budget: every page under ${LIMIT / 1024} KB gzipped client JS`);
