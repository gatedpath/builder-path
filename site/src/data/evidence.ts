// The numbers on the front page's evidence block. None of them is typed: each is read, when the
// site is built, from the file that is its source, and the build stops if a source is missing or
// no longer says what is expected. A number that cannot be read is a broken build, never a stale
// claim. Runs in Node at build time only (Astro frontmatter); nothing here reaches the browser.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// `npm run build` and `astro dev` both run from site/, so the repository is one level up.
const root = resolve(process.cwd(), '..');

function read(...candidates: string[]): { path: string; text: string } {
  for (const c of candidates) {
    const p = join(root, c);
    if (existsSync(p)) return { path: c, text: readFileSync(p, 'utf8') };
  }
  throw new Error(`evidence: none of these exist: ${candidates.join(', ')} (looked under ${root})`);
}

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`evidence: could not read ${what}`);
  return value;
}

/** The newest run of the scaffolder from the public registry: version, date and test count. */
function npmRun() {
  const dir = 'packages/create-redbelly-dapp/reports';
  const file = must(
    readdirSync(join(root, dir)).filter((f) => /^npm-run-\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().at(-1),
    `an npm-run record in ${dir}`,
  );
  const text = readFileSync(join(root, dir, file), 'utf8');
  return {
    path: `${dir}/${file}`,
    date: must(/npm-run-(\d{4}-\d{2}-\d{2})\.md$/.exec(file), 'the run date')[1],
    version: must(/^# .*?:\s*(\d+\.\d+\.\d+) on /m.exec(text), 'the version in the run record')[1],
    tests: Number(must(/`(\d+) tests passed, 0 failed/.exec(text), 'the passing test count')[1]),
    suites: Number(must(/(\d+) suites/.exec(text), 'the suite count')[1]),
  };
}

/** Dated run records behind the Verified marks: one Markdown file per run under cards/runs/. */
function runRecords() {
  const dir = join(root, 'cards/runs');
  let count = 0;
  for (const day of readdirSync(dir)) {
    const d = join(dir, day);
    if (!statSync(d).isDirectory()) continue;
    count += readdirSync(d).filter((f) => f.endsWith('.md')).length;
  }
  if (count === 0) throw new Error('evidence: no run records found under cards/runs');
  return count;
}

/** Rows of SOURCES.md. It sits at the root of the public copy and in public-repo/ in the working one. */
function sourcedFacts() {
  const { path, text } = read('SOURCES.md', 'public-repo/SOURCES.md');
  const rows = text.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Fact') && !/^\|\s*-/.test(l)).length;
  if (rows === 0) throw new Error(`evidence: no fact rows in ${path}`);
  return rows;
}

/** What every scaffold compiles with, which is what was measured on both networks. */
function compilerPins() {
  const { text } = read('packages/create-redbelly-dapp/templates/contracts/common/foundry.toml');
  return {
    solc: must(/^solc_version\s*=\s*"([^"]+)"/m.exec(text), 'solc_version')[1],
    evm: must(/^evm_version\s*=\s*"([^"]+)"/m.exec(text), 'evm_version')[1],
  };
}

/** The packages: how many there are and the one version they share. They are released together, so
 * a package at another version is a half-made release and stops the build. */
function packages() {
  const dir = join(root, 'packages');
  const list = readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, 'package.json')))
    .map((d) => JSON.parse(readFileSync(join(dir, d, 'package.json'), 'utf8')) as { name: string; version: string; license?: string });
  const versions = [...new Set(list.map((p) => p.version))];
  if (versions.length !== 1) throw new Error(`evidence: the packages are not at one version: ${versions.join(', ')}`);
  const licences = [...new Set(list.map((p) => p.license))];
  if (licences.length !== 1 || !licences[0]) throw new Error(`evidence: the packages do not share one licence: ${licences.join(', ')}`);
  return { count: list.length, version: versions[0], licence: licences[0] };
}

/** The audit's date, as SECURITY.md states it. */
function auditDate() {
  const { text } = read('SECURITY.md', 'public-repo/SECURITY.md');
  // "An internal audit found ... in 0.1.x on 19 September 2026": the version's own full stops sit
  // between "audit" and the date, so the gap is bounded by length, not by a full stop.
  return must(/\baudit\b[\s\S]{0,160}?\bon (\d{1,2} [A-Z][a-z]+ \d{4})/.exec(text), 'the audit date in SECURITY.md')[1];
}

export const evidence = {
  npmRun: npmRun(),
  runRecords: runRecords(),
  sourcedFacts: sourcedFacts(),
  compiler: compilerPins(),
  auditDate: auditDate(),
  packages: packages(),
};
