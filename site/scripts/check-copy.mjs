#!/usr/bin/env node
// Every kind of copy button says "Copied" when it worked, where a reader really meets it.
//
//   node scripts/check-copy.mjs        serves dist/ itself; also tries the offline copy if it is built
//
// The owner's report of 21 September 2026: our own buttons said "Copy failed", and the code
// blocks' buttons in the offline copy said nothing. Both faults only show where the browser
// refuses the modern clipboard route (an embedded pane, a page opened from a folder), and the
// gates ran nowhere like that, so nothing noticed. This clicks one button of each kind with
// clipboard permission withheld, on the served site and in the offline folder.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { serve, BASE, CHROMIUM, siteDir } from './serve.mjs';

const offlineRoot = resolve(siteDir, '..', 'Website Offline');
const offline = (route) => pathToFileURL(resolve(offlineRoot, ...route.split('/').filter(Boolean), 'index.html')).href;
const places = [
  ['served /start/', BASE + '/start/', { ours: true, code: true }],
  ['served /tutorials/', BASE + '/tutorials/', { ours: true, code: false }],
  ['served /agents/ (copies a file)', BASE + '/agents/', { file: true }],
];
if (existsSync(resolve(offlineRoot, 'start', 'index.html'))) {
  places.push(['offline /start/', offline('/start/'), { ours: true, code: true }], ['offline /tutorials/', offline('/tutorials/'), { ours: true, code: false }]);
}

const stop = await serve();
const browser = await chromium.launch({ executablePath: CHROMIUM });
const problems = [];
let clicks = 0;
for (const [name, url, want] of places) {
  const context = await browser.newContext({ permissions: [] });   // the clipboard permission is NOT given
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const say = async (locator, read, what, expected) => {
    if ((await locator.count()) === 0) { problems.push(`${name}: no ${what} on the page`); return; }
    const button = locator.first();
    await button.scrollIntoViewIfNeeded();
    await button.hover();
    await button.click();
    await page.waitForTimeout(350);
    clicks += 1;
    const said = (await read(button)) ?? '';
    if (!expected.test(said)) problems.push(`${name}: ${what} said "${said.trim()}" after a click`);
  };
  if (want.ours) await say(page.locator('[data-rb-copy][data-copy-target]'), (b) => b.locator('[data-copy-label]').textContent(), 'one of our copy buttons', /^Copied$/);
  if (want.file) await say(page.locator('[data-rb-copy][data-copy-url]'), (b) => b.locator('[data-copy-label]').textContent(), 'a copy-the-file button', /^Copied$/);
  if (want.code) await say(page.locator('.expressive-code .copy button'), (b) => b.evaluate((el) => el.parentElement.querySelector('.feedback')?.textContent ?? ''), 'a code block copy button', /^Copied!?$/);
  await context.close();
}
await browser.close();
stop();

console.log(`check-copy: ${clicks} click(s) across ${places.length} place(s), clipboard permission withheld${places.length === 3 ? ' (offline copy not built, not checked)' : ''}`);
for (const p of problems) console.log(`  - ${p}`);
console.log(`  ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
