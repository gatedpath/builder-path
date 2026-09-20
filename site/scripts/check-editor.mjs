#!/usr/bin/env node
// The offline site's in-page editor, driven in a real browser: an edit is kept with the paragraph it
// was made on, the export says so, an edit whose paragraph has changed is set aside and never shown
// on another paragraph, an edit follows its paragraph to a new number, and a version 1 edit is carried
// over (audit 2026-09-19, W4). Needs the offline site: node scripts/build-offline.mjs first.
//   node scripts/check-editor.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'Website Offline');
let failed = 0;
const say = (label, ...oks) => { const ok = oks.every(Boolean); if (!ok) failed += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); };
const url = pathToFileURL(root + '/identity/index.html').href;
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.click('.rb-ed-bar button');                      // Edit text
const el = page.locator('[data-rb-marker]').nth(3);
const marker = await el.getAttribute('data-rb-marker');
const original = await el.getAttribute('data-rb-original');
await el.click(); await page.keyboard.press('End'); await page.keyboard.type(' EDITED'); await page.keyboard.press('Enter');
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rb-edits-v2')));
say('an edit is stored with the paragraph it was made on, and her words are kept', stored[marker].o === original, stored[marker].t.includes('EDITED'));
// the export carries "# was:"
await page.click('text=Save my edits');
const file = await page.locator('.rb-ed-panel textarea').inputValue();
say('the exported file carries the paragraph each edit was written for', file.includes('# was: ' + original));
// a rebuild renumbers: pretend this edit was written for a paragraph that [marker] no longer is
await page.evaluate(([m]) => { const e = JSON.parse(localStorage.getItem('rb-edits-v2')); e[m].o = 'A paragraph that is no longer on this page.'; localStorage.setItem('rb-edits-v2', JSON.stringify(e)); }, [marker]);
await page.reload();
const shown = await page.locator(`[data-rb-marker="${marker}"]`).textContent();
const after = await page.evaluate(() => ({ edits: JSON.parse(localStorage.getItem('rb-edits-v2')), aside: JSON.parse(localStorage.getItem('rb-edits-set-aside') || '[]') }));
say('an edit whose paragraph has changed is not shown on another paragraph, and is set aside, not lost', !shown.includes('EDITED'), after.aside.length === 1 && after.aside[0].text.includes('EDITED'), !after.edits[marker]);
// an edit whose paragraph moved to another marker follows it
const other = page.locator('[data-rb-marker]').nth(5);
const otherMarker = await other.getAttribute('data-rb-marker'); const otherOriginal = await other.getAttribute('data-rb-original');
await page.evaluate(([m, o]) => { const e = JSON.parse(localStorage.getItem('rb-edits-v2')); e[m] = { o, t: o + ' FOLLOWED' }; localStorage.setItem('rb-edits-v2', JSON.stringify(e)); }, [marker, otherOriginal]);
await page.reload();
const followed = await page.locator(`[data-rb-marker="${otherMarker}"]`).textContent();
say('an edit follows its paragraph to its new number', followed.endsWith('FOLLOWED'));
// a version 1 edit (words only) is migrated, and kept only where it plainly belongs
await page.evaluate(([m, o]) => { localStorage.clear(); localStorage.setItem('rb-edits-v1', JSON.stringify({ [m]: o.replace(/\.$/, '') + ', reworded.' })); }, [marker, original]);
await page.reload();
const migrated = await page.evaluate(() => ({ v1: localStorage.getItem('rb-edits-v1'), v2: JSON.parse(localStorage.getItem('rb-edits-v2')) }));
say('a version 1 edit is carried over with its paragraph', migrated.v1 === null && migrated.v2[marker]?.o === original);
say('no script error on the page', errors.length === 0);
await browser.close();
console.log(failed ? `check-editor: ${failed} problem(s)` : 'check-editor: the in-page editor keeps every edit with its paragraph');
process.exit(failed ? 1 : 0);
