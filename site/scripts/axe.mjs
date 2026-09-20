// axe-core on every page at 1440 and 390, light and dark. Fails on any serious or critical
// violation. Writes reports/axe.json with every violation found, at any impact.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { serve, BASE, PAGES, CHROMIUM, siteDir } from './serve.mjs';

mkdirSync(resolve(siteDir, 'reports'), { recursive: true });
const stop = await serve();
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
const results = [];
let bad = 0;
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, isMobile: width === 390, hasTouch: width === 390 });
      await context.addInitScript((t) => localStorage.setItem('starlight-theme', t), theme);
      const page = await context.newPage();
      for (const p of PAGES) {
        await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
        const violations = r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5), count: v.nodes.length }));
        const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        bad += serious.length;
        results.push({ page: p.path, theme, width, violations, passes: r.passes.length, incomplete: r.incomplete.length });
        console.log(`${p.path} ${theme} ${width}: ${violations.length} violation(s), ${serious.length} serious/critical, ${r.passes.length} rules passed`);
        for (const v of violations) console.log(`   - [${v.impact}] ${v.id}: ${v.help} (${v.count})`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  stop();
}
const summary = { ranAt: new Date().toISOString(), axeVersion: (await import('axe-core/package.json', { with: { type: 'json' } })).default.version, seriousOrCritical: bad, results };
writeFileSync(resolve(siteDir, 'reports/axe.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`axe: ${bad} serious or critical issue(s) across ${results.length} page renders`);
if (bad) process.exit(1);
