// Offline tests. No network. They read the sibling chain-definitions package (source and
// built output) to prove the rules files cannot drift from the canonical addresses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rulesSource, neverDo, mentionedAddresses, chainFacts, formats, targetPath, render, renderAll, renderBody,
  renderClaude, writeRulesFiles, isFormat,
} from '../dist/esm/index.js';
import { snapshotFromChains } from '../scripts/snapshot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const cli = resolve(pkg, 'dist', 'esm', 'cli.js');
const chainsDir = resolve(pkg, '..', 'chain-definitions');
const addressesTs = readFileSync(resolve(chainsDir, 'src', 'addresses.ts'), 'utf8');
const chainsTs = readFileSync(resolve(chainsDir, 'src', 'chains.ts'), 'utf8');
const rulesFormats = ['claude', 'agents', 'cursor', 'copilot', 'gemini'];
const all = renderAll();

const runCli = (args, cwd = pkg) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });

test('rendering is deterministic', () => {
  const again = renderAll();
  assert.deepEqual(again, all);
  for (const f of formats) assert.equal(render(f), all[f]);
  // a second process must produce the same bytes
  const fresh = execFileSync(process.execPath, ['-e', "import('./dist/esm/index.js').then(m=>process.stdout.write(m.renderAll().claude))"], { cwd: pkg, encoding: 'utf8' });
  assert.equal(fresh, all.claude);
});

test('every format contains every never-do item', () => {
  assert.equal(neverDo.length, 8, 'PLAN 12.1 lists six items; section 15 adds two');
  for (const f of formats) for (const item of neverDo) assert.ok(all[f].includes(item), `${f} lacks never-do: ${item}`);
});

test('every format contains every chain fact', () => {
  const facts = [
    'chain 151', 'chain 153',
    chainFacts.mainnet.rpc, chainFacts.testnet.rpc,
    chainFacts.mainnet.publicRpcs[1], chainFacts.keyedRpcs.mainnet.uniblock.url, 'x-api-key',
    chainFacts.mainnet.explorer.url, chainFacts.testnet.explorer.url,
    chainFacts.mainnet.explorer.apiUrl, chainFacts.testnet.explorer.apiUrl,
    'RBNT with 18 decimals', 'Prague', 'solc 0.8.30', 'on demand', 'debug_*', 'trace_*',
    'US$0.01', 'priority fee is always zero', 'isAllowed', 'https://access.redbelly.network', 'https://redbelly.faucetme.pro/',
    'VCVerifierBaseContract', 'ZKPVerifier', 'read:packages', 'verifier API key', 'BusinessIdentifier',
    'valid, expired, revoked, wrong-jurisdiction, never-issued',
    chainFacts.mainnet.addresses.bootstrapRegistry.address,
    chainFacts.mainnet.addresses.permission.address, chainFacts.testnet.addresses.permission.address,
    chainFacts.mainnet.addresses.pricefeed.address, chainFacts.testnet.addresses.pricefeed.address,
    chainFacts.mainnet.addresses.accreditedIssuerRegistry.address, chainFacts.testnet.addresses.accreditedIssuerRegistry.address,
  ];
  assert.ok(chainFacts.mainnet.publicRpcs[1].includes('ankr'));
  for (const f of formats) for (const fact of facts) assert.ok(all[f].includes(fact), `${f} lacks fact: ${fact}`);
});

test('the five rules formats share one body verbatim; llms-full inlines it', () => {
  const body = renderBody();
  for (const f of [...rulesFormats, 'llms-full']) assert.ok(all[f].includes(body), `${f} does not contain the shared body`);
  for (const f of rulesFormats) assert.ok(all[f].includes(rulesSource.agentNotes), `${f} lacks agentNotes`);
});

test('every address in every output matches addresses.ts byte for byte', () => {
  const canonical = new Set(addressesTs.match(/0x[0-9a-fA-F]{40}/g));
  assert.ok(canonical.size >= 20);
  for (const f of formats) {
    const found = all[f].match(/0x[0-9a-fA-F]{40}/g) ?? [];
    assert.ok(found.length >= 7, `${f} mentions too few addresses`);
    for (const a of found) assert.ok(canonical.has(a), `${f} contains ${a}, which is not byte-identical to an entry in addresses.ts`);
  }
  for (const a of mentionedAddresses) assert.ok(canonical.has(a));
  // and the RPC and explorer strings come from chains.ts
  for (const url of [chainFacts.mainnet.rpc, chainFacts.testnet.rpc, chainFacts.mainnet.explorer.apiUrl, chainFacts.testnet.explorer.apiUrl, chainFacts.keyedRpcs.mainnet.uniblock.url]) {
    assert.ok(chainsTs.includes(url), `${url} is not in chains.ts`);
  }
});

test('the chain-facts snapshot equals the built @gatedpath/chains package', async () => {
  const chains = await import(resolve(chainsDir, 'dist', 'esm', 'index.js'));
  assert.deepEqual(JSON.parse(JSON.stringify(chainFacts)), JSON.parse(JSON.stringify(snapshotFromChains(chains))), 'run npm run sync');
  assert.equal(rulesSource.agentNotes, chains.agentNotes);
  assert.equal(rulesSource.verified, '2026-09-12');
});

test('no output contains a private key, a key assignment or an API key value', () => {
  const banned = [/PRIVATE_KEY=/, /0x[0-9a-fA-F]{64}/, /API_KEY=\S/];
  for (const f of formats) for (const re of banned) assert.ok(!re.test(all[f]), `${f} matches ${re}`);
  const readme = readFileSync(resolve(pkg, 'README.md'), 'utf8');
  for (const re of banned) assert.ok(!re.test(readme), `README matches ${re}`);
});

test('house style: no em dash, no marketing vocabulary, no bold-term lists', () => {
  const marketing = /\b(delve|leverage|robust|seamless|comprehensive|cutting-edge|groundbreaking|transformative|game-changing|innovative|harness|foster|bolster|underscore|unpack|pivotal|holistic|multifaceted|vibrant|landscape|realm)\b/i;
  for (const f of formats) {
    assert.ok(!all[f].includes('—'), `${f} contains an em dash`);
    assert.ok(!marketing.test(all[f]), `${f} contains marketing vocabulary: ${all[f].match(marketing)?.[0]}`);
    assert.ok(!/^\s*[-*] \*\*[^*]+\*\*:/m.test(all[f]), `${f} has a bold-term list`);
  }
});

test('each format follows its tool convention', () => {
  const cursor = all.cursor;
  assert.ok(cursor.startsWith('---\ndescription: '), 'mdc starts with front matter');
  const fm = cursor.split('---\n')[1];
  assert.match(fm, /^description: .+\nglobs:\nalwaysApply: true\n$/);
  for (const f of ['claude', 'agents', 'copilot', 'gemini']) assert.ok(all[f].startsWith('# '), `${f} has no front matter and starts with an H1`);
  // llms.txt: H1, blockquote, free markdown without headings, then H2 link lists; no H3 anywhere
  const lines = all.llms.split('\n');
  assert.ok(lines[0].startsWith('# '));
  assert.ok(lines[2].startsWith('> '));
  assert.ok(!/^### /m.test(all.llms));
  const firstH2 = lines.findIndex((l) => l.startsWith('## '));
  assert.ok(firstH2 > 3);
  for (const l of lines.slice(firstH2)) if (l.startsWith('- ')) assert.match(l, /^- \[[^\]]+\]\(https?:\/\/[^)]+\)(: .+)?$/, `bad llms link line: ${l}`);
  assert.ok(all.llms.includes('TODO(site)'), 'site-relative links are marked, not dangling');
  assert.ok(!/\]\(\/[a-z]/.test(all.llms), 'no site-relative link targets');
  assert.ok(!/\]\(\/[a-z]/.test(all['llms-full']));
  assert.ok(all['llms-full'].includes('## Chain facts'));
  assert.ok(all.claude.split('\n').length < 200, 'Claude Code recommends under 200 lines');
  for (const f of formats) assert.ok(all[f].endsWith('\n') && !all[f].endsWith('\n\n'), `${f} ends with exactly one newline`);
});

test('generated-samples match the renderer', () => {
  for (const f of formats) {
    const p = resolve(pkg, 'generated-samples', targetPath[f]);
    assert.ok(existsSync(p), `missing sample ${targetPath[f]}; run npm run samples`);
    assert.equal(readFileSync(p, 'utf8'), all[f], `${targetPath[f]} differs from the render; run npm run samples`);
  }
  const check = runCli(['--check', '--out', 'generated-samples']);
  assert.equal(check.status, 0, check.stdout + check.stderr);
});

test('README carries the rendered CLAUDE.md sample and a Last verified date', () => {
  const readme = readFileSync(resolve(pkg, 'README.md'), 'utf8');
  const block = readme.split('<!-- sample:start -->')[1]?.split('<!-- sample:end -->')[0];
  assert.ok(block, 'README lacks sample markers');
  assert.equal(block, '\n````markdown\n' + renderClaude() + '````\n', 'README sample is stale; run npm run samples');
  assert.match(readme, /## Last verified\n\n2026-09-12/);
});

test('writeRulesFiles writes, reports unchanged, honours only and dry-run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-rules-'));
  try {
    const dry = writeRulesFiles(dir, { dryRun: true });
    assert.equal(dry.written.length, formats.length);
    assert.ok(!existsSync(join(dir, 'CLAUDE.md')), 'dry run wrote a file');
    const first = writeRulesFiles(dir, { only: ['claude', 'cursor'] });
    assert.deepEqual(first.written, ['CLAUDE.md', '.cursor/rules/redbelly.mdc']);
    assert.equal(readFileSync(join(dir, '.cursor/rules/redbelly.mdc'), 'utf8'), all.cursor);
    assert.ok(!existsSync(join(dir, 'AGENTS.md')));
    const second = writeRulesFiles(dir, { only: ['claude'] });
    assert.deepEqual(second, { written: [], unchanged: ['CLAUDE.md'], drifted: [], files: { 'CLAUDE.md': all.claude } });
    const rest = writeRulesFiles(dir);
    assert.equal(rest.written.length, formats.length - 2);
    assert.equal(rest.unchanged.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--check detects drift and a missing file; the CLI exits 2 on bad arguments', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-rules-'));
  try {
    assert.equal(runCli(['--out', dir]).status, 0);
    let r = runCli(['--check', '--out', dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ok {7}CLAUDE\.md/);
    writeFileSync(join(dir, 'AGENTS.md'), all.agents + '\n- Deploy straight to mainnet.\n');
    r = runCli(['--check', '--out', dir]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /drifted {2}AGENTS\.md/);
    assert.ok(!r.stdout.includes('drifted  CLAUDE.md'));
    assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8').endsWith('mainnet.\n'), true, '--check must not write');
    unlinkSync(join(dir, 'llms.txt'));
    r = runCli(['--check', '--only', 'llms,claude', '--out', dir]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /drifted {2}llms\.txt/);
    r = runCli(['--check', '--only', 'claude', '--out', dir]);
    assert.equal(r.status, 0);
    // rewrite fixes both
    r = runCli(['--out', dir]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /wrote {7}AGENTS\.md/);
    assert.match(r.stdout, /unchanged {3}CLAUDE\.md/);
    assert.equal(runCli(['--check', '--out', dir]).status, 0);
    // dry run reports and writes nothing
    unlinkSync(join(dir, 'GEMINI.md'));
    r = runCli(['--dry-run', '--out', dir]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /would write GEMINI\.md/);
    assert.ok(!existsSync(join(dir, 'GEMINI.md')));
    assert.equal(runCli(['--only', 'nope']).status, 2);
    assert.equal(runCli(['--bogus']).status, 2);
    assert.equal(runCli(['--out']).status, 2);
    r = runCli(['--list']);
    assert.equal(r.status, 0);
    for (const f of formats) assert.ok(r.stdout.includes(targetPath[f]));
    assert.ok(runCli(['--help']).stdout.includes('--check'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('format names and paths', () => {
  assert.deepEqual([...formats], ['claude', 'agents', 'cursor', 'copilot', 'gemini', 'llms', 'llms-full']);
  assert.equal(targetPath.cursor, '.cursor/rules/redbelly.mdc');
  assert.equal(targetPath.copilot, '.github/copilot-instructions.md');
  assert.ok(isFormat('gemini') && !isFormat('GEMINI.md'));
  assert.throws(() => render('nope'));
});

// Audit 2026-09-19, R9. `redbelly-agent-rules` is this package's bin, not a package: nobody owns that
// name on npm. An agent told to `npx redbelly-agent-rules` gets a 404 today and a stranger's code the
// day someone registers it. Every npx command the rules print must name a package under our scope,
// or the one unscoped package we publish.
test('every npx command in every rendered file names a package we own', async () => {
  const { renderAll } = await import('../dist/esm/index.js');
  let seen = 0;
  for (const [format, content] of Object.entries(renderAll())) {
    for (const m of content.matchAll(/\bnpx\s+(?:-y\s+|--yes\s+)?(?:-p\s+)?(\S+)/g)) {
      seen += 1;
      assert.match(m[1], /^(@gatedpath\/[a-z-]+|create-redbelly-dapp)(@\S+)?$/, `${format}: npx ${m[1]}`);
    }
  }
  assert.ok(seen > 0, 'the rules do print an npx command');
});
