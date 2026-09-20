// Fails the build when an embedded sample drifts from its source, when a published file
// (llms.txt, the rules files) differs from the package sample, or when an MDX page carries
// a fenced code block in a language that must come through <Sample>. Exit 1 on any finding.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { computeExpected, manifestFor, generatedDir, publicDir, siteDir, rootDir } from './samples-lib.mjs';
import { allowedFenceLangs } from '../samples.config.mjs';

const problems = [];
const expected = computeExpected();

// 1. Generated extracts match a fresh extraction from the sources.
for (const s of expected) {
  const file = resolve(generatedDir, s.file);
  if (!existsSync(file)) { problems.push(`missing extract ${s.file}; run npm run samples`); continue; }
  if (readFileSync(file, 'utf8') !== s.content) problems.push(`drift: ${s.file} no longer matches ${s.source}`);
  if (s.publish) {
    const target = resolve(publicDir, s.publish);
    if (!existsSync(target)) problems.push(`missing published copy public/${s.publish}`);
    else if (readFileSync(target, 'utf8') !== s.fullText) problems.push(`drift: public/${s.publish} no longer matches ${s.source}`);
  }
}
const manifestPath = resolve(generatedDir, 'manifest.json');
if (!existsSync(manifestPath)) problems.push('missing manifest.json; run npm run samples');
else if (readFileSync(manifestPath, 'utf8') !== JSON.stringify(manifestFor(expected), null, 2) + '\n') problems.push('manifest.json is stale; run npm run samples');

// 2. Nothing extra sits in the generated folder.
if (existsSync(generatedDir)) {
  const known = new Set([...expected.map((s) => s.file), 'manifest.json']);
  for (const f of readdirSync(generatedDir)) if (!known.has(f)) problems.push(`unexpected file in generated folder: ${f}`);
}

// 3. No pasted code in content. Fenced blocks are limited to shell and plain text.
const ids = new Set(expected.map((s) => s.id));
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(md|mdx)$/.test(name)) lint(p);
  }
}
function lint(path) {
  const rel = relative(siteDir, path);
  const text = readFileSync(path, 'utf8');
  const fence = /^(\s*)(```+|~~~+)([^\n]*)$/gm;
  let m;
  let open = null;
  while ((m = fence.exec(text))) {
    if (!open) { open = m[3].trim().split(/\s+/)[0] ?? ''; if (!allowedFenceLangs.has(open)) problems.push(`${rel}: fenced \`${open}\` block; code samples must come through <Sample>`); }
    else open = null;
  }
  for (const use of text.matchAll(/<Sample\s+[^>]*id=["']([^"']+)["']/g)) {
    if (!ids.has(use[1])) problems.push(`${rel}: <Sample id="${use[1]}"> is not in samples.config.mjs`);
  }
  if (/<Code\s[^>]*code=\{?["'`]/.test(text)) problems.push(`${rel}: <Code code="..."> with a literal; use <Sample>`);
}
walk(resolve(siteDir, 'src/content'));

// 4. The sources actually compile here, not just somewhere else. Solidity samples go through
//    solc 0.8.30 targeting prague (the network's pins); TypeScript sources go through tsc with
//    the package's own tsconfig. Test-file extracts are covered by the package's `npm test`,
//    which this check does not run; the manifest names it.
const require = createRequire(import.meta.url);
const solc = require('solc');
for (const s of expected.filter((s) => s.file.endsWith('.sol') && s.solc !== false)) {
  // Sibling .sol files under `solcSources` (a directory) are supplied so relative imports resolve.
  const sources = { [s.source]: { content: s.fullText } };
  if (s.solcSources) {
    const dir = resolve(rootDir, s.solcSources);
    const walkSol = (d) => { for (const n of readdirSync(d)) { const q = join(d, n); if (statSync(q).isDirectory()) walkSol(q); else if (n.endsWith('.sol')) sources[relative(rootDir, q)] = { content: readFileSync(q, 'utf8') }; } };
    walkSol(dir);
  }
  const input = { language: 'Solidity', sources, settings: { evmVersion: 'prague', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['evm.bytecode.object'] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e) => e.severity === 'error');
  if (errors.length) problems.push(`${s.source} does not compile with solc ${solc.version()} for prague: ${errors.map((e) => e.formattedMessage.trim()).join(' | ')}`);
  else if (!out.contracts?.[s.source]) problems.push(`${s.source}: solc produced no contract`);
}
const tsProjects = new Set(expected.filter((s) => /\.ts$/.test(s.source) && s.typecheck !== false).map((s) => s.source.split('/').slice(0, 2).join('/')));
for (const project of tsProjects) {
  const tsconfig = resolve(rootDir, project, 'tsconfig.json');
  if (!existsSync(tsconfig)) { problems.push(`${project}: no tsconfig.json to type-check with`); continue; }
  const tsc = resolve(siteDir, 'node_modules/typescript/bin/tsc');
  const r = spawnSync(process.execPath, [tsc, '-p', tsconfig, '--noEmit'], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`${project}: tsc --noEmit failed:\n${(r.stdout + r.stderr).trim()}`);
}

if (problems.length) {
  console.error('check-samples: ' + problems.length + ' problem(s)');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`check-samples: ${expected.length} samples match their sources; Solidity compiles with solc ${solc.version()} for prague; ${[...tsProjects].join(', ')} type-check; no pasted code in content`);
