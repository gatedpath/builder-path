// Fails the quality run when the built /errors page and the failure table in
// packages/agent-rules/src/failures.ts disagree: every kind in the source must have its own
// section on the page, the page must carry no section the source lacks, and the count on the
// page must match. The page is rendered from the same file at build, so a difference means a
// build served stale output. Run after `npm run build`.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rootDir, siteDir } from './samples-lib.mjs';

const source = readFileSync(resolve(rootDir, 'packages/agent-rules/src/failures.ts'), 'utf8');
const kinds = [...source.matchAll(/^\s{4}kind: '([a-z0-9-]+)',$/gm)].map((m) => m[1]);
const page = resolve(siteDir, 'dist/errors/index.html');
if (!existsSync(page)) {
  console.error('check-errors: dist/errors/index.html is missing; run npm run build first');
  process.exit(1);
}
const html = readFileSync(page, 'utf8');
const rendered = [...html.matchAll(/data-kind="([a-z0-9-]+)"/g)].map((m) => m[1]);
const problems = [];
if (kinds.length < 30) problems.push(`only ${kinds.length} kinds found in failures.ts; the regex or the file changed shape`);
for (const k of kinds) if (!rendered.includes(k)) problems.push(`kind ${k} is in failures.ts but not on /errors`);
for (const k of rendered) if (!kinds.includes(k)) problems.push(`section ${k} is on /errors but not in failures.ts`);
if (new Set(rendered).size !== rendered.length) problems.push('a kind is rendered twice');
if (!html.includes(`${kinds.length} entries`)) problems.push(`the page does not state ${kinds.length} entries`);
for (const k of kinds) if (!html.includes(`id="${k}"`)) problems.push(`no anchor id="${k}"`);
// The rules files the site offers for download are copies of the package's render. They drifted
// once: the package stopped printing an npx command for a name nobody owns, and the site's copies
// still did (19 September 2026). Byte for byte, or the gate fails.
const samples = resolve(rootDir, 'packages/agent-rules/generated-samples');
for (const [from, to] of [
  ['CLAUDE.md', 'public/agent-rules/CLAUDE.md'],
  ['AGENTS.md', 'public/agent-rules/AGENTS.md'],
  ['GEMINI.md', 'public/agent-rules/GEMINI.md'],
  ['.github/copilot-instructions.md', 'public/agent-rules/copilot-instructions.md'],
  ['.cursor/rules/redbelly.mdc', 'public/agent-rules/cursor-rules-redbelly.mdc'],
  ['llms.txt', 'public/llms.txt'],
  ['llms-full.txt', 'public/llms-full.txt'],
]) {
  const a = readFileSync(resolve(samples, from), 'utf8');
  const b = readFileSync(resolve(rootDir, 'site', to), 'utf8');
  if (a !== b) problems.push(`site/${to} is not the package's ${from}; copy it from packages/agent-rules/generated-samples`);
}

if (problems.length) {
  console.error(`check-errors: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`check-errors: ${kinds.length} failure kinds in packages/agent-rules/src/failures.ts, ${rendered.length} sections on /errors, one to one`);
