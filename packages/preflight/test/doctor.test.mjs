// redbelly-doctor: every check driven to pass, warn and fail with a PATH the test builds itself.
// The exit-0 shim is reproduced here as a Node script that spawns the real forge and exits 0
// whatever it returned, so the test needs no particular install; the fix text is asserted to be
// the failure table's, so doctor and explain_failure say the same thing. No network, no key.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { failureByKind } from '@gatedpath/agent-rules/failures';
import { DOCTOR_CHECK_IDS, exitCodePropagates, looksLikeNodeShim, renderDoctorText, runDoctor, scaffoldRoot, whichOnPath } from '../dist/index.js';
import { commit, gitInit } from './project.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'dist', 'doctor-cli.js');
const byId = (r, id) => r.checks.find((c) => c.id === id);
const realForge = whichOnPath('forge');
const hasFoundry = Boolean(realForge) && spawnSync('anvil', ['--version']).status === 0 && spawnSync('cast', ['--version']).status === 0;
const gitDir = dirname(whichOnPath('git'));
const nodeDir = dirname(process.execPath);

/** A PATH holding only the directories given, plus node's own so scripts with a node shebang run. */
const pathOf = (...dirs) => ({ PATH: [...dirs, nodeDir].join(delimiter) });

/** A fake tool: an executable script that answers --version with `version` and exits 2 on anything else, like clap. */
function fakeTool(dir, name, version) {
  const p = join(dir, name);
  writeFileSync(p, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${name} Version: ${version}"; exit 0; fi\necho "error: unexpected argument $1" >&2; exit 2\n`);
  chmodSync(p, 0o755);
  return p;
}

/** The @foundry-rs shim's behaviour: spawn the real binary, forward its output, exit 0 regardless. */
function fakeShim(dir, name, real) {
  const pkg = join(dir, 'node_modules', '@foundry-rs', name);
  mkdirSync(pkg, { recursive: true });
  const bin = join(pkg, 'bin.mjs');
  writeFileSync(bin, `#!/usr/bin/env node\nimport { spawn } from 'node:child_process';\nspawn(${JSON.stringify(real)}, process.argv.slice(2), { stdio: 'inherit' });\n`);
  chmodSync(bin, 0o755);
  // The platform package beside it, the way npm nests it.
  const platformBin = join(pkg, 'node_modules', '@foundry-rs', `${name}-${process.platform}-${process.arch === 'x64' ? 'amd64' : process.arch}`, 'bin');
  mkdirSync(platformBin, { recursive: true });
  symlinkSync(real, join(platformBin, name));
  symlinkSync(bin, join(dir, name));
  return { onPath: join(dir, name), real: join(platformBin, name) };
}

test('the report has one line per check in a fixed order, and this machine passes what it has', async () => {
  const r = await runDoctor({ project: here });
  assert.equal(r.tool, 'redbelly-doctor');
  assert.deepEqual(r.checks.map((c) => c.id), [...DOCTOR_CHECK_IDS]);
  assert.equal(byId(r, 'node').status, 'pass');
  assert.equal(byId(r, 'git').status, 'pass');
  assert.equal(byId(r, 'env-tracked').status, 'pass', byId(r, 'env-tracked').reason);
  assert.equal(byId(r, 'vendor').status, 'pass');
  assert.equal(byId(r, 'vendor').data.scaffold, false);
  for (const c of r.checks) {
    assert.ok(['pass', 'warn', 'fail'].includes(c.status));
    assert.ok(c.reason.length > 3, c.id);
    if (c.status === 'pass') assert.equal(c.fix, null, `${c.id} passes and carries no fix`);
    if (c.status !== 'pass' && c.kind) assert.equal(c.fix, c.fix === null ? null : c.fix, c.id);
    assert.ok(!c.required || c.status !== 'warn' || c.id === 'vendor', `${c.id}: a required check passes or fails`);
  }
  assert.ok(!byId(r, 'slither').required && !byId(r, 'aderyn').required, 'the analysers are optional');
  const text = renderDoctorText(r);
  assert.match(text, /^redbelly-doctor \d+\.\d+\.\d+  project /);
  for (const c of r.checks) assert.match(text, new RegExp(`^${c.status.padEnd(5)} ${c.id.padEnd(18)} `, 'm'));
  assert.ok(!text.includes('!'), 'no exclamation mark');
});

test('node older than 22 fails with the table\'s words; 22 passes', async () => {
  const old = await runDoctor({ project: here, nodeVersion: 'v20.19.0' });
  assert.equal(byId(old, 'node').status, 'fail');
  assert.match(byId(old, 'node').reason, /^v20\.19\.0 is older than 22/);
  assert.equal(byId(old, 'node').kind, 'node-too-old');
  assert.equal(byId(old, 'node').fix, failureByKind('node-too-old').fix.command);
  assert.equal(old.ok, false);
  assert.match(renderDoctorText(old), /^fail  node               v20\.19\.0 is older than 22.*  Fix: nvm install 22/m);
  const fresh = await runDoctor({ project: here, nodeVersion: 'v22.0.0' });
  assert.equal(byId(fresh, 'node').status, 'pass');
});

test('an empty PATH fails git, forge, anvil and cast with the install lines, and the optional tools warn', async () => {
  const r = await runDoctor({ project: here, env: { PATH: mkdtempSync(join(tmpdir(), 'doctor-empty-')) } });
  assert.equal(byId(r, 'git').status, 'fail');
  assert.equal(byId(r, 'git').fix, failureByKind('git-not-found').fix.command);
  for (const t of ['forge', 'cast']) {
    assert.equal(byId(r, t).status, 'fail');
    assert.equal(byId(r, t).reason, 'not found on PATH.');
    assert.equal(byId(r, t).kind, 'forge-not-found');
    assert.equal(byId(r, t).fix, failureByKind('forge-not-found').fix.command);
  }
  assert.equal(byId(r, 'anvil').kind, 'anvil-not-found');
  assert.equal(byId(r, 'foundry-version').status, 'fail');
  assert.match(byId(r, 'foundry-version').reason, /cannot compare: forge, anvil, cast missing/);
  assert.equal(byId(r, 'foundry-exit-code').status, 'fail');
  assert.equal(byId(r, 'slither').status, 'warn');
  assert.equal(byId(r, 'slither').fix, failureByKind('slither-not-found').fix.command);
  assert.equal(byId(r, 'aderyn').status, 'warn');
  assert.equal(byId(r, 'aderyn').kind, 'aderyn-not-found');
  assert.equal(byId(r, 'env-tracked').status, 'fail', 'no git, so the tracked check cannot run');
  assert.equal(r.ok, false);
  assert.match(renderDoctorText(r), /not ok: \d+ required checks failed/);
});

test('forge, anvil and cast at different versions fail foundry-version', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'doctor-versions-'));
  fakeTool(dir, 'forge', '1.7.1');
  fakeTool(dir, 'anvil', '1.7.1');
  fakeTool(dir, 'cast', '1.6.0');
  const r = await runDoctor({ project: here, env: pathOf(dir, gitDir) });
  for (const t of ['forge', 'anvil', 'cast']) assert.equal(byId(r, t).status, 'pass', t);
  assert.equal(byId(r, 'cast').data.version, '1.6.0');
  assert.equal(byId(r, 'foundry-version').status, 'fail');
  assert.match(byId(r, 'foundry-version').reason, /forge 1\.7\.1, anvil 1\.7\.1, cast 1\.6\.0/);
  assert.equal(byId(r, 'foundry-version').fix, failureByKind('foundry-version-mismatch').fix.command);
  assert.equal(byId(r, 'foundry-exit-code').status, 'pass', 'the fakes exit 2 on a bogus flag, like clap');
  assert.equal(r.ok, false);
});

test('the exit-0 shim is detected by probing, named, and the fix links the real binary it found', { skip: hasFoundry ? false : 'forge is not installed' }, async () => {
  // The real path up front: on macOS the temp folder sits behind a symlink (/var -> /private/var), and
  // doctor reports the real location of the binary it found.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'doctor-shim-')));
  const shim = fakeShim(dir, 'forge', realForge);
  fakeTool(dir, 'anvil', '1.7.1');
  fakeTool(dir, 'cast', '1.7.1');
  assert.equal(await exitCodePropagates(shim.onPath), false, 'the shim exits 0 on a bogus flag');
  assert.equal(await exitCodePropagates(realForge), true, 'the real binary exits 2');
  assert.equal(looksLikeNodeShim(shim.onPath), true);
  assert.equal(looksLikeNodeShim(realForge), false);
  const r = await runDoctor({ project: here, env: pathOf(dir, gitDir) });
  assert.equal(byId(r, 'forge').status, 'pass');
  assert.match(byId(r, 'forge').reason, /1\.7\.1 at .* \(the npm shim; see foundry-exit-code\)/);
  const c = byId(r, 'foundry-exit-code');
  assert.equal(c.status, 'fail');
  assert.equal(c.kind, 'foundry-exit-code-shim');
  assert.match(c.reason, /forge at .* is the @foundry-rs npm shim \(--this-flag-does-not-exist exited 0; the real binary exits 2\), real binary /);
  assert.equal(c.fix, `ln -sf ${shim.real} ${shim.onPath}`);
  assert.equal(c.data.shims[0].real, shim.real);
  assert.equal(r.ok, false);
  const line = renderDoctorText(r).split('\n').find((l) => l.startsWith('fail  foundry-exit-code'));
  assert.match(line, /Fix: ln -sf /);
});

test('a tracked .env fails; .env.example alone passes; outside a repository nothing is tracked', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'doctor-env-'));
  gitInit(repo);
  writeFileSync(join(repo, '.env.example'), 'ADMIN_SAFE=\n');
  writeFileSync(join(repo, 'README.md'), 'x\n');
  commit(repo, 'start', '2026-09-14T10:00:00Z');
  let r = await runDoctor({ project: repo });
  assert.equal(byId(r, 'env-tracked').status, 'pass');
  assert.match(byId(r, 'env-tracked').reason, /no \.env among 2 tracked files/);
  writeFileSync(join(repo, '.env'), 'ADMIN_SAFE=\n');
  mkdirSync(join(repo, 'web'));
  writeFileSync(join(repo, 'web', '.env.local'), 'X=1\n');
  execFileSync('git', ['add', '-f', '.env', 'web/.env.local'], { cwd: repo });
  commit(repo, 'oops', '2026-09-14T10:01:00Z');
  r = await runDoctor({ project: repo });
  assert.equal(byId(r, 'env-tracked').status, 'fail');
  assert.equal(byId(r, 'env-tracked').reason, '.env, web/.env.local are tracked by git.');
  assert.equal(byId(r, 'env-tracked').fix, failureByKind('env-tracked').fix.command);
  assert.equal(r.ok, false);
  const bare = mkdtempSync(join(tmpdir(), 'doctor-bare-'));
  r = await runDoctor({ project: bare });
  assert.equal(byId(r, 'env-tracked').reason, 'not a git repository, so nothing is tracked.');
});

test('vendor/ against the record: match passes, drift fails, no record warns, and contracts/ finds its scaffold', async () => {
  const root = mkdtempSync(join(tmpdir(), 'doctor-scaffold-'));
  const vendor = (name, version) => {
    mkdirSync(join(root, 'vendor', name), { recursive: true });
    writeFileSync(join(root, 'vendor', name, 'package.json'), JSON.stringify({ name: `@gatedpath/${name.replace('redbelly-', '')}`, version }));
  };
  vendor('redbelly-chains', '0.1.0');
  vendor('redbelly-agent-rules', '0.1.0');
  mkdirSync(join(root, 'contracts'));
  writeFileSync(join(root, 'contracts', 'foundry.toml'), '[profile.default]\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', redbelly: { scaffolder: '0.1.0', vendor: { 'redbelly-chains': '0.1.0', 'redbelly-agent-rules': '0.1.0' } } }));
  assert.equal(scaffoldRoot(root), root);
  assert.equal(scaffoldRoot(join(root, 'contracts')), root);
  let r = await runDoctor({ project: join(root, 'contracts') });
  assert.equal(r.scaffold, true);
  assert.equal(r.project, join(root, 'contracts'));
  assert.equal(byId(r, 'vendor').status, 'pass');
  assert.match(byId(r, 'vendor').reason, /matches the record: redbelly-chains 0\.1\.0, redbelly-agent-rules 0\.1\.0/);
  vendor('redbelly-chains', '0.0.9');
  r = await runDoctor({ project: root });
  assert.equal(byId(r, 'vendor').status, 'fail');
  assert.equal(byId(r, 'vendor').reason, 'vendor/redbelly-chains is 0.0.9, the record says 0.1.0.');
  assert.equal(byId(r, 'vendor').kind, 'vendor-drift');
  assert.equal(byId(r, 'vendor').fix, failureByKind('vendor-drift').fix.command);
  assert.equal(r.ok, false);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x' }));
  r = await runDoctor({ project: root });
  assert.equal(byId(r, 'vendor').status, 'warn');
  assert.match(byId(r, 'vendor').reason, /predates the version record/);
  assert.equal(r.ok, true, 'a missing record is a warning, not a fail');
});

test('the CLI: exit 0 with --json on this machine, 1 when a check fails, 2 on a bad argument, help and version', () => {
  const ok = spawnSync(process.execPath, [cli, '--json', '--project', here], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const report = JSON.parse(ok.stdout);
  assert.equal(report.tool, 'redbelly-doctor');
  assert.equal(report.ok, true);
  const bad = spawnSync(process.execPath, [cli, '--project', here], { encoding: 'utf8', env: { PATH: mkdtempSync(join(tmpdir(), 'doctor-cli-empty-')) } });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^fail  forge              not found on PATH\.  Fix: curl -L https:\/\/foundry\.paradigm\.xyz/m);
  assert.match(bad.stdout, /not ok: /);
  const usage = spawnSync(process.execPath, [cli, '--nope'], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /unknown argument "--nope"/);
  const key = spawnSync(process.execPath, [cli, '0x' + 'ab'.repeat(32)], { encoding: 'utf8' });
  assert.equal(key.status, 2);
  assert.match(key.stderr, /looks like a private key/);
  assert.ok(!key.stderr.includes('ab'.repeat(32)), 'the value is never echoed');
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^redbelly-doctor \[options\]/);
  const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  assert.match(version.stdout, /^\d+\.\d+\.\d+\n$/);
  const viaRedbelly = spawnSync(process.execPath, [join(here, '..', 'dist', 'redbelly.js'), 'doctor', '--json', '--project', here], { encoding: 'utf8' });
  assert.equal(viaRedbelly.status, 0, viaRedbelly.stderr);
  assert.equal(JSON.parse(viaRedbelly.stdout).tool, 'redbelly-doctor');
});
