// Tests for the scaffold's `npm run dev` (templates/base/scripts/dev.mjs, PLAN.md 18.1).
//
// The first block is offline: argument parsing, the table and the notes, imported from a bare
// scaffold with the vendored chains package linked in by hand (no install). The second block
// spawns the script for real on a fresh gated-erc20 scaffold with a plain Anvil (--no-fork, so
// nothing is fetched from a network beyond the scaffold's own install), and checks the file it
// writes, the states on the chain, the exit codes, the second-run refusal and that Ctrl-C stops
// Anvil. The fork variant and the web app are run in the integration test and the golden path.
//
// Needs forge, anvil and cast on PATH for the second block, and network for `contracts:install`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const bin = join(pkgRoot, 'bin', 'index.js');
const tmp = mkdtempSync(join(tmpdir(), 'create-redbelly-dapp-dev-'));
const bareDir = join(tmp, 'bare');
const appDir = join(tmp, 'app');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
function must(cmd, args, opts = {}) {
  const r = run(cmd, args, opts);
  assert.equal(r.code, 0, `${cmd} ${args.join(' ')} failed:\n${r.out.slice(-4000)}`);
  return r;
}
function freePort() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}
const KEY_SHAPE = /(^|[^0-9a-fA-F])0x[0-9a-fA-F]{64}([^0-9a-fA-F]|$)/;
// Anvil's accounts 0 and 1, which pass isAllowed on the real networks (RESEARCH.md 30): never wallets here.
const NEVER_USED = ['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'];

/**
 * Starts dev.mjs and resolves once it has printed its JSON record (stdout) or exited. Returns the
 * child, the parsed record, and buffers that keep filling.
 */
function startDev(cwd, args, extraEnv = {}) {
  return new Promise((res) => {
    const child = spawn(process.execPath, ['scripts/dev.mjs', '--json', ...args], { cwd, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    const io = { stdout: '', stderr: '', code: null };
    let settled = false;
    const settle = (record) => {
      if (settled) return;
      settled = true;
      res({ child, io, record });
    };
    child.stdout.on('data', (d) => {
      io.stdout += d;
      if (/\n\}\n/.test(io.stdout)) {
        try {
          settle(JSON.parse(io.stdout.slice(0, io.stdout.indexOf('\n}\n') + 3)));
        } catch {
          /* not whole yet */
        }
      }
    });
    child.stderr.on('data', (d) => (io.stderr += d));
    child.on('exit', (code) => {
      io.code = code;
      settle(null);
    });
  });
}
function waitExit(child, io) {
  return new Promise((res) => {
    if (io.code !== null) return res(io.code);
    child.on('exit', (code) => res(code));
  });
}

before(() => {
  must('node', [join(pkgRoot, 'scripts', 'build-siblings.mjs')]);
});
after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ---- offline ----

test('the script is a template with no placeholders and imports from a bare scaffold', async () => {
  must('node', [bin, bareDir, '--yes', '--no-web', '--no-hardhat', '--template', 'empty']);
  const script = join(bareDir, 'scripts', 'dev.mjs');
  assert.ok(existsSync(script));
  const text = readFileSync(script, 'utf8');
  assert.ok(!/__[A-Z][A-Z0-9_]*__/.test(text), 'no placeholder survives');
  assert.ok(!/\{\{[#/]/.test(text), 'no block tag survives');
  assert.match(readFileSync(join(bareDir, 'package.json'), 'utf8'), /"dev": "node scripts\/dev\.mjs"/);
  assert.match(readFileSync(join(bareDir, '.gitignore'), 'utf8'), /deployments\/local\.json/);
  // No install: link the vendored chains package where Node looks for it.
  mkdirSync(join(bareDir, 'node_modules', '@gatedpath'), { recursive: true });
  symlinkSync(join(bareDir, 'vendor', 'redbelly-chains'), join(bareDir, 'node_modules', '@gatedpath', 'chains'), 'dir');
  const dev = await import(pathToFileURL(script).href);
  assert.deepEqual(dev.STATES, ['NeverIssued', 'Valid', 'Expired', 'Revoked', 'WrongJurisdiction']);
  assert.deepEqual(dev.WALLET_INDICES, [2, 3, 4, 5, 6]);
  assert.equal(dev.DEPLOYER_INDEX, 7);
  assert.equal(dev.LOCAL_CHAIN_ID, 31337);
  assert.deepEqual(dev.EXIT, { RUNNING: 0, FAILED: 1, ALREADY_RUNNING: 2, TOOLS_MISSING: 3 });

  // parseArgs: every flag from PLAN.md 18.1, defaults, and refusals.
  const { parseArgs, UsageError, renderTable, noteFor } = dev;
  assert.deepEqual(parseArgs([]), { chain: 153, port: 8545, webPort: 3000, web: true, fork: true, requestId: 18, requestIdSource: 'default', json: false, help: false });
  assert.deepEqual(parseArgs(['--chain', '151', '--port', '9000', '--web-port', '3001', '--no-web', '--no-fork', '--request-id', '708', '--json']), {
    chain: 151, port: 9000, webPort: 3001, web: false, fork: false, requestId: 708, requestIdSource: 'flag', json: true, help: false,
  });
  assert.equal(parseArgs(['--port=9001']).port, 9001);
  assert.equal(parseArgs(['--chain=151']).chain, 151);
  assert.throws(() => parseArgs(['--chain', '1']), UsageError);
  assert.throws(() => parseArgs(['--chain', '31337']), UsageError);
  assert.throws(() => parseArgs(['--port', 'x']), UsageError);
  assert.throws(() => parseArgs(['--request-id']), UsageError);
  assert.throws(() => parseArgs(['--bogus']), UsageError);

  // renderTable: one row per wallet in enum order, the impersonation command beside each, no key.
  const deployment = {
    chainId: 31337, forkOf: 153, verifier: '0x00000000000000000000000000000000000000e1', contract: '0x00000000000000000000000000000000000000c0', requestId: 18,
    deployer: { index: 7, address: '0x7777777777777777777777777777777777777777' },
    wallets: dev.STATES.map((state, i) => ({ index: i + 2, state, address: `0x${String(i + 2).repeat(40)}`, note: noteFor(i + 2, state) })),
    startedAt: '2026-09-14T00:00:00.000Z',
  };
  const table = renderTable(deployment, { rpcUrl: 'http://127.0.0.1:8545', webUrl: 'http://localhost:3000', contractName: 'GatedERC20', forkBlock: 3034388 });
  const rows = table.split('\n').filter((l) => /^\d\s/.test(l));
  assert.equal(rows.length, 5);
  for (const [i, row] of rows.entries()) {
    assert.match(row, new RegExp(`^${i + 2}\\s+${dev.STATES[i]}\\s+0x${String(i + 2).repeat(40)}\\s+cast rpc anvil_impersonateAccount 0x${String(i + 2).repeat(40)} --rpc-url http://127.0.0.1:8545$`));
  }
  assert.match(table, /fork of 153 at block 3034388/);
  assert.match(table, /GatedERC20 0x00000000000000000000000000000000000000c0/);
  assert.match(table, /request id 18/);
  assert.match(table, /accounts 0 and 1 are never used/);
  assert.match(table, /http:\/\/localhost:3000/);
  assert.match(table, /Ctrl-C stops Anvil and the web app/);
  assert.ok(!KEY_SHAPE.test(table));
  assert.match(noteFor(3, 'Valid'), /^Anvil account 3; passes the gate/);
  assert.match(renderTable({ ...deployment, forkOf: null }, { rpcUrl: 'http://127.0.0.1:8545', webUrl: null, contractName: 'GatedExample', forkBlock: null }), /\(no fork\)[\s\S]*Ctrl-C stops Anvil\.$/);
});

test('missing forge or anvil exits 3 with the install line; a bad flag exits 1 with the usage', () => {
  // A PATH with nothing on it: node is invoked by absolute path, and the script finds no forge.
  const emptyBin = join(tmp, 'empty-bin');
  mkdirSync(emptyBin, { recursive: true });
  let r = run(process.execPath, ['scripts/dev.mjs', '--no-web'], { cwd: bareDir, env: { PATH: emptyBin } });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stderr, /forge and anvil not found on PATH/);
  assert.match(r.stderr, /foundryup/);
  assert.match(r.stderr, /@foundry-rs\/forge/);
  assert.match(r.stderr, /npm run doctor/);
  assert.equal(r.stdout, '');

  r = run(process.execPath, ['scripts/dev.mjs', '--chain', '1'], { cwd: bareDir });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--chain must be 153 \(testnet\) or 151 \(mainnet\)/);
  assert.match(r.stderr, /usage: npm run dev/);

  r = run(process.execPath, ['scripts/dev.mjs', '--help'], { cwd: bareDir });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /usage: npm run dev/);
});

test('an uninstalled scaffold exits 1 and names the install step, before starting anything', () => {
  for (const tool of ['forge', 'anvil']) assert.equal(run(tool, ['--version']).code, 0, `${tool} must be on PATH`);
  const r = run(process.execPath, ['scripts/dev.mjs', '--no-web'], { cwd: bareDir });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /contracts are not installed: run npm install && npm run contracts:install/);
  assert.ok(!existsSync(join(bareDir, 'deployments', 'local.lock')));
});

// ---- over a spawned Anvil ----

test('npm run dev --no-fork --no-web: five wallets in five states, the record, the second-run refusal, Ctrl-C', async () => {
  for (const tool of ['forge', 'anvil', 'cast']) assert.equal(run(tool, ['--version']).code, 0, `${tool} must be on PATH (install Foundry: https://getfoundry.sh)`);
  must('node', [bin, appDir, '--yes', '--no-web', '--no-hardhat']);
  must('npm', ['install', '--no-audit', '--no-fund'], { cwd: appDir });
  must('npm', ['run', 'contracts:install'], { cwd: appDir });

  const port = await freePort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  const { child, io, record } = await startDev(appDir, ['--no-fork', '--no-web', '--port', String(port)]);
  try {
    assert.ok(record, `dev.mjs exited ${io.code} before printing its record:\n${io.stderr.slice(-3000)}`);
    assert.equal(io.code, null, 'still running');

    // The record, as PLAN.md 18.1 fixes it, with account indices and no key.
    assert.equal(record.chainId, 31337);
    assert.equal(record.forkOf, null);
    assert.equal(record.requestId, 18);
    assert.match(record.verifier, /^0x[0-9a-fA-F]{40}$/);
    assert.match(record.contract, /^0x[0-9a-fA-F]{40}$/);
    assert.deepEqual(record.wallets.map((w) => w.state), ['NeverIssued', 'Valid', 'Expired', 'Revoked', 'WrongJurisdiction']);
    assert.deepEqual(record.wallets.map((w) => w.index), [2, 3, 4, 5, 6]);
    assert.equal(record.deployer.index, 7);
    assert.match(record.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    for (const w of record.wallets) {
      assert.match(w.address, /^0x[0-9a-fA-F]{40}$/);
      assert.ok(!NEVER_USED.includes(w.address.toLowerCase()), `${w.address} is an account that is never used`);
      assert.match(w.note, new RegExp(`^Anvil account ${w.index}; `));
      assert.ok(!('privateKey' in w) && !('key' in w));
    }
    assert.ok(!NEVER_USED.includes(record.deployer.address.toLowerCase()));
    const file = readFileSync(join(appDir, 'deployments', 'local.json'), 'utf8');
    assert.deepEqual(JSON.parse(file), record, 'stdout JSON is the file');
    assert.ok(!KEY_SHAPE.test(file) && !KEY_SHAPE.test(io.stdout) && !KEY_SHAPE.test(io.stderr), 'no key-shaped value anywhere');
    // --json: the record and nothing else on stdout.
    assert.equal(io.stdout.trim(), JSON.stringify(record, null, 2));
    assert.ok(existsSync(join(appDir, 'deployments', 'local.lock')));

    // The chain agrees with the record: states in enum order, the gate open, the Valid wallet may subscribe.
    const rpc = ['--rpc-url', rpcUrl];
    assert.equal(must('cast', ['chain-id', ...rpc]).stdout.trim(), '31337');
    for (const [i, w] of record.wallets.entries()) {
      const status = must('cast', ['call', record.verifier, 'eligibilityStatus(address,uint64)(uint8)', w.address, '18', ...rpc]).stdout.trim();
      assert.equal(status, String(i), `${w.address} should read ${i} (${w.state})`);
      const can = must('cast', ['call', record.contract, 'canSubscribe(address)(bool)', w.address, ...rpc]).stdout.trim();
      assert.equal(can, i === 1 ? 'true' : 'false');
    }
    const accounts = JSON.parse(must('cast', ['rpc', 'eth_accounts', ...rpc]).stdout);
    assert.deepEqual(record.wallets.map((w) => w.address.toLowerCase()), accounts.slice(2, 7).map((a) => a.toLowerCase()), 'wallets are Anvil accounts 2 to 6');
    assert.equal(record.deployer.address.toLowerCase(), accounts[7].toLowerCase());
    // The permission gate on the local chain allows the five wallets (and never touched 0 and 1).
    const chains = await import(pathToFileURL(join(appDir, 'vendor', 'redbelly-chains', 'dist', 'esm', 'index.js')).href);
    const permission = chains.addresses.testnet.permission.address;
    for (const w of record.wallets) assert.equal(must('cast', ['call', permission, 'isAllowed(address)(bool)', w.address, ...rpc]).stdout.trim(), 'true');
    assert.equal(must('cast', ['call', permission, 'isAllowed(address)(bool)', accounts[0], ...rpc]).stdout.trim(), 'false');
    // The Valid wallet's gated action goes through; the NeverIssued wallet's reverts with NotEligible.
    must('cast', ['send', '--unlocked', '--from', record.wallets[1].address, record.contract, 'subscribe()', ...rpc]);
    const denied = run('cast', ['send', '--unlocked', '--from', record.wallets[0].address, record.contract, 'subscribe()', ...rpc]);
    assert.notEqual(denied.code, 0);
    assert.match(denied.out, /NotEligible|0x879342fb/);
    // Stderr carried the steps and a total, for the golden path's timings.
    assert.match(io.stderr, /\[dev\] anvil ready/);
    assert.match(io.stderr, /\[dev\] seeded five wallets/);
    assert.match(io.stderr, /\[dev\] ready in \d+\.\d s/);

    // A second run while the first runs says so and exits 2, and starts nothing.
    const second = run(process.execPath, ['scripts/dev.mjs', '--no-web', '--no-fork', '--port', String(await freePort())], { cwd: appDir });
    assert.equal(second.code, 2, second.out);
    assert.match(second.stderr, new RegExp(`already running \\(pid ${child.pid},`));
    assert.equal(second.stdout, '');
  } finally {
    child.kill('SIGINT');
  }
  // Ctrl-C: exit 0, Anvil gone, lock gone, record kept.
  const code = await waitExit(child, io);
  assert.equal(code, 0, `exit after SIGINT should be 0:\n${io.stderr.slice(-2000)}`);
  for (let i = 0; i < 50 && run('cast', ['chain-id', '--rpc-url', rpcUrl]).code === 0; i += 1) await new Promise((r) => setTimeout(r, 100));
  assert.notEqual(run('cast', ['chain-id', '--rpc-url', rpcUrl]).code, 0, 'anvil should be stopped');
  assert.ok(!existsSync(join(appDir, 'deployments', 'local.lock')), 'lock removed');
  assert.ok(existsSync(join(appDir, 'deployments', 'local.json')), 'record kept for the next web:dev');

  // After a clean stop the same command runs again (the lock is gone), on a chosen request id.
  const again = await startDev(appDir, ['--no-fork', '--no-web', '--port', String(port), '--request-id', '708']);
  try {
    assert.ok(again.record, `second start failed:\n${again.io.stderr.slice(-2000)}`);
    assert.equal(again.record.requestId, 708);
    const status = must('cast', ['call', again.record.verifier, 'eligibilityStatus(address,uint64)(uint8)', again.record.wallets[1].address, '708', '--rpc-url', rpcUrl]).stdout.trim();
    assert.equal(status, '1');
  } finally {
    again.child.kill('SIGINT');
    await waitExit(again.child, again.io);
  }
});

test('a stale lock from a dead process does not block a start, and REQUEST_ID in .env is the default request id', async () => {
  writeFileSync(join(appDir, 'deployments', 'local.lock'), JSON.stringify({ pid: 999999, port: 1, startedAt: 'never' }));
  writeFileSync(join(appDir, '.env'), 'REQUEST_ID=708\n');
  const port = await freePort();
  const { child, io, record } = await startDev(appDir, ['--no-fork', '--no-web', '--port', String(port)]);
  try {
    assert.ok(record, `start with a stale lock failed:\n${io.stderr.slice(-2000)}`);
    assert.equal(JSON.parse(readFileSync(join(appDir, 'deployments', 'local.lock'), 'utf8')).pid, child.pid);
    assert.equal(record.requestId, 708, '.env REQUEST_ID is the default');
    assert.match(io.stderr, /request id 708 from \.env/);
  } finally {
    child.kill('SIGINT');
    await waitExit(child, io);
  }

  // No flag, no .env: the deploy script's own default is what the contract is bound to, read back
  // from the chain. A project that moved its script to another recipe gets that recipe's gate.
  rmSync(join(appDir, '.env'));
  const script = join(appDir, 'contracts', 'script', 'Deploy.s.sol');
  writeFileSync(script, readFileSync(script, 'utf8').replace('vm.envOr("REQUEST_ID", uint256(18))', 'vm.envOr("REQUEST_ID", uint256(708))'));
  const own = await startDev(appDir, ['--no-fork', '--no-web', '--port', String(port)]);
  try {
    assert.ok(own.record, `start failed:\n${own.io.stderr.slice(-2000)}`);
    assert.equal(own.record.requestId, 708, "the deploy script's default is the bound id");
    assert.match(own.io.stderr, /request id 708 \(the deploy script's default\)/);
    assert.equal(must('cast', ['call', own.record.contract, 'requestId()(uint64)', '--rpc-url', `http://127.0.0.1:${port}`]).stdout.trim(), '708');
  } finally {
    own.child.kill('SIGINT');
    await waitExit(own.child, own.io);
  }
});
