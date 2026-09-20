// Full-page screenshots of every page at 1440 and 390 in the light theme, plus the dark
// theme at 1440 for four pages, so the owner can review the look without running anything.
// JPEG at quality 55 keeps the folder small enough to commit; desktop captures render at a
// device scale of 0.5, so the files are 720 px wide like the design study's own screenshots.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { serve, BASE, PAGES, CHROMIUM, siteDir } from './serve.mjs';

const outDir = resolve(siteDir, 'reports/screenshots');
mkdirSync(outDir, { recursive: true });
const stop = await serve();
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      if (theme === 'dark' && width === 390) continue;
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 1 : 0.5, colorScheme: theme, isMobile: width === 390, hasTouch: width === 390, reducedMotion: 'reduce' });
      await context.addInitScript((t) => localStorage.setItem('starlight-theme', t), theme);
      const page = await context.newPage();
      for (const p of PAGES) {
        if (theme === 'dark' && !['home', 'start', 'tutorials', 'agents'].includes(p.name)) continue;
        await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const file = resolve(outDir, `${p.name}-${width}${theme === 'dark' ? '-dark' : ''}.jpg`);
        await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 55 });
        console.log('saved', file.replace(siteDir + '/', ''));
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  stop();
}
