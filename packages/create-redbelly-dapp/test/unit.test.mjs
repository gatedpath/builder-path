// Offline unit tests for the scaffolder's pure parts: argument parsing, template rendering
// and the stub refusal. No forge, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, UsageError, validateName } from '../src/args.mjs';
import { renderText, outputName, isTextFile } from '../src/render.mjs';
import { assertTemplateReady, TemplateNotReady, renderRedbellySolSmoke } from './helpers.mjs';
import { TEMPLATES, PACKAGE_MANAGERS } from '../src/options.mjs';

test('every prompt has a flag and --yes fills the rest', () => {
  const p = parseArgs(['my-app', '--template', 'empty', '--pm', 'pnpm', '--no-hardhat', '--web', '--yes', '--install', '--force']);
  assert.equal(p.name, 'my-app');
  assert.deepEqual(p.answers, { template: 'empty', packageManager: 'pnpm', hardhat: false, web: true });
  assert.equal(p.flags.yes, true);
  assert.equal(p.flags.install, true);
  assert.equal(p.flags.force, true);
  assert.deepEqual(parseArgs(['--template=gated-erc20']).answers, { template: 'gated-erc20' });
});

test('bad arguments are usage errors', () => {
  assert.throws(() => parseArgs(['--template', 'nope']), UsageError);
  assert.throws(() => parseArgs(['--pm', 'bun']), UsageError);
  assert.throws(() => parseArgs(['--bogus']), UsageError);
  assert.throws(() => parseArgs(['a', 'b']), UsageError);
  assert.throws(() => parseArgs(['Bad Name']), UsageError);
  assert.doesNotThrow(() => validateName('/tmp/x/good-name'));
  assert.doesNotThrow(() => validateName('.'));
});

test('renderText handles placeholders, nested blocks and unknown variables', () => {
  const vars = { PROJECT_NAME: 'demo', web: true, pnpm: false };
  assert.equal(renderText('# __PROJECT_NAME__\n', vars), '# demo\n');
  assert.equal(renderText('{{#unless pnpm}}\na\n{{#if web}}\nb\n{{/if}}\n{{/unless}}\nc\n', vars), 'a\nb\nc\n');
  assert.equal(renderText('{{#if web}}7{{/if}}{{#unless web}}6{{/unless}}.', vars), '7.');
  assert.equal(renderText('{{#if web}}7{{/if}}{{#unless web}}6{{/unless}}.', { ...vars, web: false }), '6.');
  assert.throws(() => renderText('{{#if nope}}x{{/if}}', vars), /unknown variable/);
  assert.throws(() => renderText('{{#if web}}x', vars), /unbalanced/);
  assert.equal(renderText('__dirname __NOT_A_VAR__', vars), '__dirname __NOT_A_VAR__');
});

test('npm-hostile file names are renamed on output; text detection', () => {
  assert.equal(outputName('_gitignore'), '.gitignore');
  assert.equal(outputName('_env.example'), '.env.example');
  assert.equal(outputName('src/_npmrc'), 'src/.npmrc');
  assert.ok(isTextFile('a/b.sol'));
  assert.ok(isTextFile('a/.gitignore'));
  assert.ok(isTextFile('Safe.runtime.hex') === false);
});

test('stub templates refuse before touching disk', () => {
  for (const t of Object.keys(TEMPLATES).filter((k) => !TEMPLATES[k].ready)) {
    assert.throws(() => assertTemplateReady(t), TemplateNotReady);
    assert.ok(TEMPLATES[t].missing.length >= 3, `${t} lists what it is missing`);
  }
  for (const t of Object.keys(TEMPLATES).filter((k) => TEMPLATES[k].ready)) assert.doesNotThrow(() => assertTemplateReady(t));
  assert.deepEqual(Object.keys(PACKAGE_MANAGERS), ['npm', 'pnpm', 'yarn']);
});

test('the Solidity constants library renders from the chains package without retyping', async () => {
  const sol = await renderRedbellySolSmoke();
  assert.match(sol, /pragma solidity 0\.8\.30;/);
  assert.match(sol, /MAINNET_CHAIN_ID = 151;/);
  assert.match(sol, /TESTNET_CHAIN_ID = 153;/);
  assert.match(sol, /BOOTSTRAP_REGISTRY = 0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5;/);
  assert.match(sol, /SAFE_SINGLETON = 0x41675C099F32341bf84BFc5382aF534df5C7461a;/);
});

// The scaffold's own files name recipe folders. Until 18 September 2026 a scaffolded project had
// none, so the env example pointed a builder (or an agent told to "use the over-18 recipe") at
// nothing. This holds the two together: whatever recipes/ path a template names must exist in
// what vendorRecipes writes.
test('every recipes/ folder a template names is in the scaffold', async () => {
  const { mkdtempSync, readFileSync, readdirSync, statSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { vendorRecipes, TEMPLATES_DIR } = await import('../src/generate.mjs');

  const dir = mkdtempSync(join(tmpdir(), 'rb-recipes-'));
  try {
    const written = vendorRecipes(dir);
    assert.ok(written.includes('recipes/over-18/recipe.json'));
    assert.ok(existsSync(join(dir, 'recipes', 'VENDORED.md')));
    assert.ok(!existsSync(join(dir, 'recipes', 'check.mjs')), 'the library validator stays behind');

    const named = new Set();
    const walk = (d) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!isTextFile(p)) continue;
        for (const m of readFileSync(p, 'utf8').matchAll(/\brecipes\/([a-z0-9-]+)/g)) named.add(m[1]);
      }
    };
    walk(TEMPLATES_DIR);
    assert.ok(named.size >= 2, `expected the templates to name recipes, found ${[...named]}`);
    for (const name of named) {
      assert.ok(existsSync(join(dir, 'recipes', name, 'recipe.json')), `templates name recipes/${name}, which the scaffold does not contain`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The scaffold's root pins one copy of each web library through `overrides`. Those versions are
// written a second time in the web template; if the two drift, npm installs two copies again and
// the web app fails with "No QueryClient set" (18 September 2026).
test('the root overrides match the web template version for version', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { TEMPLATES_DIR } = await import('../src/generate.mjs');
  const rootText = readFileSync(join(TEMPLATES_DIR, 'base', 'package.json'), 'utf8');
  const block = /"overrides": \{([^}]*)\}/.exec(rootText);
  assert.ok(block, 'templates/base/package.json has an overrides block');
  const overrides = JSON.parse(`{${block[1]}}`);
  const web = JSON.parse(readFileSync(join(TEMPLATES_DIR, 'web', 'package.json'), 'utf8')).dependencies;
  assert.ok(Object.keys(overrides).length >= 5, 'the five web libraries are pinned');
  for (const [name, version] of Object.entries(overrides)) {
    assert.equal(version, web[name], `${name}: root override ${version}, web template ${web[name]}`);
  }
});

// The sibling lookup's last resort, for installs with no node_modules folder to walk: climb from a
// resolved file to the package that owns it. A nested package.json with another name (dist/cjs
// carries one) must not stop the climb.
test('packageRootFrom climbs past a nested package.json to the named package', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { packageRootFrom } = await import('../src/siblings.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'rb-root-'));
  try {
    const root = join(dir, 'store', '@gatedpath', 'chains');
    mkdirSync(join(root, 'dist', 'cjs'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"name":"@gatedpath/chains"}');
    writeFileSync(join(root, 'dist', 'cjs', 'package.json'), '{"type":"commonjs"}');
    writeFileSync(join(root, 'dist', 'cjs', 'index.js'), '');
    assert.equal(packageRootFrom(join(root, 'dist', 'cjs', 'index.js'), '@gatedpath/chains'), root);
    assert.equal(packageRootFrom(join(root, 'dist', 'cjs', 'index.js'), '@gatedpath/other'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Audit 2026-09-19, R8. A write with no `chainId` goes out on whatever network the wallet is on. A
// first-time user's wallet is on Ethereum (Redbelly is pre-configured nowhere), so they signed and
// paid for a call to that address on the wrong chain. Every write in the web template names the
// app's chain, and the page that writes refuses to while the wallet is elsewhere.
test('every contract write in the web template names the chain, behind a wrong-network guard', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { TEMPLATES_DIR } = await import('../src/generate.mjs');
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(e)) files.push(p); } };
  walk(join(TEMPLATES_DIR, 'web', 'src'));
  let writes = 0;
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/write\.mutate\(\{[^}]*\}\)/g)) {
      writes += 1;
      assert.match(m[0], /chainId: chain\.id/, `${f}: a write without chainId`);
      assert.match(text, /useOnAppChain\(\)/, `${f}: writes, but does not check the wallet's network`);
    }
  }
  assert.ok(writes >= 2, `expected the two writes the template has, found ${writes}`);
});

// Audit 2026-09-19, S1. On npm the siblings depend on each other by version, not by `file:` path.
test('a vendored package finds its vendored siblings whether it came from the repository or from npm', async () => {
  const { pointAtVendoredSiblings } = await import('../src/generate.mjs');
  const fromNpm = { dependencies: { '@gatedpath/chains': '0.1.0', '@gatedpath/agent-rules': '^0.1.0', viem: '2.56.3' }, peerDependencies: { '@gatedpath/chains': '*' } };
  const fromRepo = { dependencies: { '@gatedpath/chains': 'file:../chain-definitions', '@gatedpath/agent-rules': 'file:../agent-rules', viem: '2.56.3' } };
  for (const pkg of [fromNpm, fromRepo]) {
    pointAtVendoredSiblings(pkg);
    assert.equal(pkg.dependencies['@gatedpath/chains'], 'file:../redbelly-chains');
    assert.equal(pkg.dependencies['@gatedpath/agent-rules'], 'file:../redbelly-agent-rules');
    assert.equal(pkg.dependencies.viem, '2.56.3', 'other dependencies are left alone');
  }
  assert.equal(fromNpm.peerDependencies['@gatedpath/chains'], 'file:../redbelly-chains');
});

// Audit 2026-09-19, O8. A package with an `exports` map that leaves out ./package.json refuses
// `require('<name>/package.json')`, which is how tools read a version. That refusal is what broke
// the scaffolder 0.1.0 on npm. Every package we publish lists it.
test('every published package that has an exports map lists ./package.json', async () => {
  const { readFileSync, readdirSync, existsSync } = await import('node:fs');
  const { join, resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const packages = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let checked = 0;
  for (const dir of readdirSync(packages)) {
    const file = join(packages, dir, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (pkg.private || !pkg.exports || typeof pkg.exports !== 'object') continue;
    checked += 1;
    assert.equal(pkg.exports['./package.json'], './package.json', `${pkg.name} does not export ./package.json`);
  }
  assert.ok(checked >= 8, `expected the published packages, checked ${checked}`);
});
