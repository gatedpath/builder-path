#!/usr/bin/env node
// No page scrolls sideways, at a phone's width or a desktop's.
//
//   node scripts/check-overflow.mjs      serves dist/ itself, like the other quality scripts
//
// The audit of 19 September 2026 found /start/ 807 px wide on a 390 px phone: one badge that would
// not wrap. Nothing failed, because nothing looked. The pages are read from dist/, not from a list
// somebody has to remember to add to, and the run fails if it finds none.
import { chromium } from 'playwright';
import { serve, BASE, CHROMIUM, distRoutes } from './serve.mjs';

const WIDTHS = [390, 1440];
// Languages that mean "what a program printed": they keep their lines and may scroll (astro.config.mjs).
const OUTPUT_LANGS = ['text', 'txt', 'ansi', 'log', 'console'];
const routes = distRoutes();
if (routes.length === 0) { console.error('check-overflow: no pages in dist/; build first'); process.exit(1); }

const stop = await serve();
const browser = await chromium.launch({ executablePath: CHROMIUM });
const problems = [];
let checked = 0;
try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    for (const route of routes) {
      const res = await page.goto(BASE + route, { waitUntil: 'load' });
      if (!res || res.status() !== 200) { problems.push(`${route} at ${width}: HTTP ${res?.status()}`); continue; }
      const r = await page.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        if (sw <= cw + 1) return { cw, sw };
        // Name the widest thing that is not meant to scroll inside itself.
        let worst = null;
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('pre, table, .expressive-code, [hidden]')) continue;
          const right = el.getBoundingClientRect().right;
          if (right > cw + 1 && (!worst || right > worst.right)) {
            worst = { right: Math.round(right), tag: el.tagName.toLowerCase(), cls: String(el.className).split(' ')[0], text: (el.textContent ?? '').trim().slice(0, 40) };
          }
        }
        return { cw, sw, worst };
      });
      checked += 1;
      if (r.sw > r.cw + 1) {
        const w = r.worst ? `; widest: <${r.worst.tag} class="${r.worst.cls}"> ends at ${r.worst.right} px ("${r.worst.text}")` : '';
        problems.push(`${route} at ${width}: page is ${r.sw} px wide${w}`);
      }
      // Inside the boxes. Since 26 September 2026 source and commands wrap, so a code block that
      // still scrolls sideways is a fault unless it is program output (text, ansi, log), which keeps
      // its exact lines and scrolls on purpose. A recording's screen wraps like a terminal and must
      // never scroll.
      const blocks = await page.evaluate((outputLangs) => {
        const out = [];
        for (const pre of document.querySelectorAll('.expressive-code pre')) {
          if (pre.scrollWidth <= pre.clientWidth + 1) continue;
          const lang = pre.dataset.language ?? '';
          if (outputLangs.includes(lang)) continue;
          let longest = 0;
          for (const line of pre.querySelectorAll('.ec-line')) longest = Math.max(longest, (line.textContent ?? '').trim().length);
          const title = pre.closest('figure')?.querySelector('figcaption')?.textContent?.trim().slice(0, 60) ?? '';
          out.push(`code block (${lang || 'no language'}${title ? `, "${title}"` : ''}) scrolls ${pre.scrollWidth - pre.clientWidth} px; longest line ${longest} characters`);
        }
        for (const pre of document.querySelectorAll('.rb-cast__screen')) {
          if (pre.scrollWidth > pre.clientWidth + 1) out.push(`recording screen scrolls ${pre.scrollWidth - pre.clientWidth} px`);
        }
        return out;
      }, OUTPUT_LANGS);
      for (const b of blocks) problems.push(`${route} at ${width}: ${b}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await stop();
}

console.log(`check-overflow: ${routes.length} pages at ${WIDTHS.join(', ')} px, ${checked} checked`);
if (checked === 0) problems.push('nothing was checked');
for (const p of problems) console.log(`  - ${p}`);
console.log(`  ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
