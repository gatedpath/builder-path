#!/usr/bin/env node
// A reader who asks for less motion still gets everything on the page.
//
//   node scripts/check-motion.mjs      serves dist/ itself, like the other quality scripts
//
// Why this exists. The recordings are played by a button that scripts reveal. When the system asks
// for reduced motion the player stops before revealing it, which is right, but until 22 September
// 2026 it also left the box clipped to its last screen with nothing to press and nothing said. A
// reader with that setting saw a dead terminal and no sign that a recording existed at all. Every
// other gate runs at the default setting, so nothing looked, and it sat there through the day the
// owner was asked to go and play them.
//
// The rule: with prefers-reduced-motion set to reduce, every recording on every page shows its
// whole output and says why it is not being played. Motion may be dropped; content may not.
import { chromium } from 'playwright';
import { serve, BASE, CHROMIUM, distRoutes } from './serve.mjs';

const routes = distRoutes();
if (routes.length === 0) { console.error('check-motion: no pages in dist/; build first'); process.exit(1); }

const stop = await serve();
const browser = await chromium.launch({ executablePath: CHROMIUM });
const problems = [];
let boxes = 0;
let pages = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const route of routes) {
    const res = await page.goto(BASE + route, { waitUntil: 'load' });
    if (!res || res.status() !== 200) { problems.push(`${route}: HTTP ${res?.status()}`); continue; }
    // The player mounts on load; give it the frame it needs before reading the result.
    await page.waitForTimeout(150);
    const found = await page.evaluate(() => {
      const out = [];
      for (const figure of document.querySelectorAll('.rb-cast')) {
        const pre = figure.querySelector('.rb-cast__screen');
        const note = figure.querySelector('.rb-cast__note');
        out.push({
          id: figure.dataset.cast ?? '(no id)',
          mounted: figure.dataset.mounted !== undefined,
          clipped: figure.classList.contains('rb-cast--window'),
          // Clipped or not, this is the honest question: is any of the run out of view?
          hidesOutput: !!pre && pre.scrollHeight > pre.clientHeight + 1,
          note: (note?.textContent ?? '').trim(),
        });
      }
      return out;
    });
    if (found.length === 0) continue;
    pages += 1;
    for (const f of found) {
      boxes += 1;
      const where = `${route} recording "${f.id}"`;
      if (!f.mounted) { problems.push(`${where}: the player did not mount, so the page is whatever the HTML shipped`); continue; }
      if (f.clipped || f.hidesOutput) problems.push(`${where}: part of the run is out of view and there is nothing to press; show it in full`);
      if (!f.note) problems.push(`${where}: nothing tells the reader why it is not being played`);
    }
  }
  await context.close();
} finally {
  await browser.close();
  await stop();
}

console.log(`check-motion: ${boxes} recording(s) on ${pages} page(s), with reduced motion asked for`);
if (boxes === 0) problems.push('no recordings were found, so nothing was checked');
for (const p of problems) console.log(`  - ${p}`);
console.log(`  ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
