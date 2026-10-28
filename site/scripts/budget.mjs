// Two tiers, because they cost different people different things (21 September 2026).
//
// On load: the client JavaScript every visitor pays for, gzipped: every <script src> the page
// loads plus its inline scripts. Fails above 60 KB. This is the phone's limit, and the first
// visit's. The figure was set on 12 September 2026 at about twice what Starlight ships, as a
// tripwire against a heavy library; nobody measured it, and it has done its job once (it is why
// a 64 KB third-party player was not used).
//
// On demand: a terminal recording's replay data, /casts/<id>.js, which the page does not load. It
// is added when a reader presses Play, so only someone who asks for a replay pays for one. Fails
// above 150 KB a recording, a figure chosen to be generous and to stop a runaway log.
//
// HTML is reported against the design study's 40 KB (site/design/DESIGN.md section 8) and only
// warned about: that figure was never enforced and /start/ was already over it. Whether to raise
// it or trim the page is the owner's to decide. Writes reports/bundle.json.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative, resolve } from 'node:path';
import { siteDir } from './serve.mjs';

const LIMIT = 60 * 1024;
const ON_DEMAND_LIMIT = 150 * 1024;
const HTML_TARGET = 40 * 1024;
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
// On demand: the recordings.
const onDemand = [];
const castsDir = resolve(dist, 'casts');
if (existsSync(castsDir)) {
  for (const name of readdirSync(castsDir).filter((n) => n.endsWith('.js')).sort()) {
    const size = gz(readFileSync(resolve(castsDir, name)));
    onDemand.push({ file: `/casts/${name}`, gzip: size });
    if (size > ON_DEMAND_LIMIT) over = true;
    console.log(`${('/casts/' + name).padEnd(40)} on demand ${(size / 1024).toFixed(1)} KB${size > ON_DEMAND_LIMIT ? '  OVER BUDGET' : ''}`);
  }
}
const heavyHtml = rows.filter((r) => r.htmlGzip > HTML_TARGET);
for (const r of heavyHtml) console.log(`warning: ${r.route} html is ${(r.htmlGzip / 1024).toFixed(1)} KB, over the design study's ${HTML_TARGET / 1024} KB (not enforced)`);

writeFileSync(resolve(siteDir, 'reports/bundle.json'), JSON.stringify({ ranAt: new Date().toISOString(), limitBytes: LIMIT, onDemandLimitBytes: ON_DEMAND_LIMIT, htmlTargetBytes: HTML_TARGET, onDemand, note: 'gzip level 9; js = every <script src> the page loads, its inline scripts, and the Pagefind UI chunk Starlight imports on idle; the Pagefind index itself loads only when a search is typed and is not counted; css = inline styles (all stylesheets are inlined at build)', rows }, null, 2) + '\n');
if (over) { console.error(`budget: over. On load the limit is ${LIMIT / 1024} KB of client JS a page; on demand it is ${ON_DEMAND_LIMIT / 1024} KB a recording`); process.exit(1); }
console.log(`budget: every page under ${LIMIT / 1024} KB gzipped client JS on load; ${onDemand.length} recording(s) on demand, each under ${ON_DEMAND_LIMIT / 1024} KB; ${heavyHtml.length} page(s) over the ${HTML_TARGET / 1024} KB html target (warned, not failed)`);
