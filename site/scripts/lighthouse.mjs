// Lighthouse on /, /start/, /tutorials/, /operate/ and /status/ at mobile and desktop, using the pre-installed
// Chromium. Writes reports/lighthouse/<page>-<form>.json and a summary. Fails if performance,
// accessibility or best practices is under 95 on any run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { serve, BASE, CHROMIUM, siteDir } from './serve.mjs';

const TARGET = 95;
const pages = [
  { name: 'home', path: '/' },
  { name: 'start', path: '/start/' },
  { name: 'tutorials', path: '/tutorials/' },
  { name: 'operate', path: '/operate/' },
  { name: 'status', path: '/status/' },
];
const outDir = resolve(siteDir, 'reports/lighthouse');
mkdirSync(outDir, { recursive: true });
const stop = await serve();
const chrome = await launch({ chromePath: CHROMIUM, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const rows = [];
let failed = false;
try {
  for (const form of ['mobile', 'desktop']) {
    for (const p of pages) {
      // Mobile runs use Lighthouse's default config (moto G4 class device, slow 4G); desktop runs use
      // its own desktop preset (no CPU slowdown, 40 ms RTT, 10 Mbps), both with simulated throttling.
      const options = { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] };
      const result = await lighthouse(BASE + p.path, options, form === 'desktop' ? desktopConfig : undefined);
      const lhr = result.lhr;
      const score = (c) => Math.round((lhr.categories[c]?.score ?? 0) * 100);
      const row = { page: p.path, form, performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo'), lcpMs: Math.round(lhr.audits['largest-contentful-paint']?.numericValue ?? 0), cls: Number((lhr.audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)), tbtMs: Math.round(lhr.audits['total-blocking-time']?.numericValue ?? 0), lighthouseVersion: lhr.lighthouseVersion };
      rows.push(row);
      // The full report is several megabytes per run; keep the scores and every audit's
      // result, drop the trace-derived details.
      const trimmed = { lighthouseVersion: lhr.lighthouseVersion, fetchTime: lhr.fetchTime, requestedUrl: lhr.requestedUrl, configSettings: { formFactor: lhr.configSettings.formFactor, throttlingMethod: lhr.configSettings.throttlingMethod, throttling: lhr.configSettings.throttling }, categories: Object.fromEntries(Object.entries(lhr.categories).map(([k, c]) => [k, { score: c.score, auditRefs: c.auditRefs.map((r) => ({ id: r.id, weight: r.weight })) }])), audits: Object.fromEntries(Object.entries(lhr.audits).map(([k, a]) => [k, { id: a.id, title: a.title, score: a.score, scoreDisplayMode: a.scoreDisplayMode, displayValue: a.displayValue, numericValue: a.numericValue }])) };
      writeFileSync(resolve(outDir, `${p.name}-${form}.json`), JSON.stringify(trimmed, null, 1) + '\n');
      const ok = row.performance >= TARGET && row.accessibility >= TARGET && row.bestPractices >= TARGET;
      if (!ok) failed = true;
      console.log(`${p.path} ${form}: perf ${row.performance} a11y ${row.accessibility} bp ${row.bestPractices} seo ${row.seo} (LCP ${row.lcpMs} ms, CLS ${row.cls}, TBT ${row.tbtMs} ms)${ok ? '' : '  BELOW ' + TARGET}`);
      if (!ok) {
        const audits = Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary').map((a) => `${a.id}: ${a.title}`);
        console.log('   failing binary audits: ' + audits.join('; '));
      }
    }
  }
} finally {
  await chrome.kill();
  stop();
}
const summary = { ranAt: new Date().toISOString(), target: TARGET, chromium: CHROMIUM, rows };
writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
let md = `# Lighthouse\n\nRun ${summary.ranAt} with Lighthouse ${rows[0]?.lighthouseVersion} on the pre-installed Chromium against a static gzip server of dist/. Mobile: the default config (slow 4G, 4x CPU slowdown). Desktop: Lighthouse's desktop preset. Simulated throttling. Target: at least ${TARGET} in performance, accessibility and best practices.\n\n| Page | Form | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.page} | ${r.form} | ${r.performance} | ${r.accessibility} | ${r.bestPractices} | ${r.seo} | ${r.lcpMs} ms | ${r.cls} | ${r.tbtMs} ms |\n`;
writeFileSync(resolve(outDir, 'SUMMARY.md'), md);
if (failed) { console.error('lighthouse: a score is below ' + TARGET); process.exit(1); }
