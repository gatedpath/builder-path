#!/usr/bin/env node
// Every tooltip on the site, at three widths: does its bubble stay on the screen, does its
// trigger carry a description, and does showing it give the page a sideways scroll?
//
//   node scripts/check-tips.mjs          serves dist/ itself, like the other quality scripts
//
// A tooltip that works at one width and runs off the edge at another is the fault this exists
// for: it happened three times while the component was being built, once per anchoring rule.
// Pills sit in running prose, so where they land on a line changes with every width.
import { chromium } from 'playwright';
import { serve, BASE, CHROMIUM } from './serve.mjs';

const PAGES = ['/', '/start/', '/tutorials/', '/agents/', '/operate/', '/review/', '/research/'];
const WIDTHS = [390, 900, 1440];

const stop = await serve();
const browser = await chromium.launch({ executablePath: CHROMIUM });
let checked = 0;
const problems = [];

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: 'load' });
    // The width the page has with no tooltip showing. A tip is only at fault for a sideways
    // scroll it causes, not for one a wide table already gave the page.
    const baseWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const triggers = await page.locator('.rb-tip__trigger').count();
    for (let i = 0; i < triggers; i += 1) {
      const trigger = page.locator('.rb-tip__trigger').nth(i);
      if (!(await trigger.isVisible())) continue;     // inside a closed tab panel
      await trigger.scrollIntoViewIfNeeded();
      // Reach it the way a keyboard does. A scripted focus() is not :focus-visible, so it would
      // report every bubble as hidden; hovering is the other real route and is checked as well.
      await trigger.hover();
      await page.waitForTimeout(220);
      const r = await trigger.evaluate((el, baseWidth) => {
        const id = el.getAttribute('aria-describedby');
        const bubble = id && document.getElementById(id);
        if (!bubble) return { id, missing: true };
        const b = bubble.getBoundingClientRect();
        const cs = getComputedStyle(bubble);
        return {
          id,
          role: bubble.getAttribute('role'),
          text: bubble.textContent.trim().length,
          shown: cs.visibility === 'visible',
          left: b.left, right: b.right, top: b.top, bottom: b.bottom,
          vw: document.documentElement.clientWidth, vh: window.innerHeight,
          scrollX: document.documentElement.scrollWidth > baseWidth + 1,
        };
      }, baseWidth);
      // and by keyboard: Tab from the element before it
      await page.mouse.move(0, 0);
      await trigger.evaluate((el) => el.blur());
      await trigger.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(220);
      const byKeyboard = await trigger.evaluate((el) => {
        const b = document.getElementById(el.getAttribute('aria-describedby'));
        return document.activeElement === el && getComputedStyle(b).visibility === 'visible';
      });
      if (!byKeyboard) problems.push(`${width}px ${path} #${r.id}: not shown when reached by Tab`);
      checked += 1;
      const where = `${width}px ${path} #${r.id}`;
      if (r.missing) { problems.push(`${where}: no element for aria-describedby`); continue; }
      if (r.role !== 'tooltip') problems.push(`${where}: role is "${r.role}"`);
      if (!r.text) problems.push(`${where}: empty direction`);
      if (!r.shown) problems.push(`${where}: not visible on hover`);
      if (r.left < -0.5 || r.right > r.vw + 0.5) problems.push(`${where}: off screen sideways [${Math.round(r.left)}, ${Math.round(r.right)}] of ${r.vw}`);
      if (r.top < -0.5 || r.bottom > r.vh + 0.5) problems.push(`${where}: off screen vertically [${Math.round(r.top)}, ${Math.round(r.bottom)}] of ${r.vh}`);
      if (r.scrollX) problems.push(`${where}: page scrolls sideways while shown`);
    }
    // ids must be unique or aria-describedby points at the wrong words
    const dupes = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[role="tooltip"]')].map((e) => e.id);
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    });
    for (const d of dupes) problems.push(`${width}px ${path}: duplicate tooltip id "${d}"`);
  }
  await page.close();
}
await browser.close();
stop();

console.log(`check-tips: ${checked} tooltip showings across ${PAGES.length} pages at ${WIDTHS.join(', ')} px`);
console.log(`  ${problems.length} problem(s)`);
for (const p of problems.slice(0, 25)) console.log(`  ${p}`);
process.exit(problems.length ? 1 : 0);
