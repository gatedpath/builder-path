// The alert poller against a real GatedERC20 from packages/contract-kit on anvil: every watched
// event is produced on-chain, the poller decodes it and posts it to a local webhook. Needs
// forge, cast and anvil on PATH (the same toolchain the contract kit uses); no real network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRpc } from '@gatedpath/chains';
import { pollOnce } from '../scripts/alert.mjs';
import { topicsByName } from '../src/events.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const kit = resolve(here, '..', '..', 'contract-kit');
const mockPkg = resolve(here, '..', '..', 'receptor-mock');
const alertScript = resolve(here, '..', 'scripts', 'alert.mjs');

let anvil;
let rpcUrl;
let rpc;
let accounts;
let token;
let mock;
let webhook;
const received = [];
const tmp = mkdtempSync(join(tmpdir(), 'ops-kit-alert-'));

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 4000));
  return r.stdout;
}

// The script posts to a webhook served by this process, so it must run while the event loop
// is free: spawn, not spawnSync.
function runScript(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [alertScript, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    const timer = setTimeout(() => child.kill(), 20_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', reject);
  });
}

function create(root, path, args = []) {
  const out = run('forge', ['create', path, '--rpc-url', rpcUrl, '--unlocked', '--from', accounts[0], '--broadcast', ...(args.length ? ['--constructor-args', ...args] : [])], { cwd: root });
  return out.match(/Deployed to: (0x[0-9a-fA-F]{40})/)[1];
}

function send(from, to, sig, ...args) {
  return run('cast', ['send', '--unlocked', '--from', from, to, sig, ...args, '--rpc-url', rpcUrl]);
}

before(async () => {
  for (const t of ['forge', 'cast', 'anvil']) {
    const r = spawnSync(t, ['--version']);
    assert.equal(r.status, 0, `${t} must be on PATH`);
  }
  const port = 18600 + Math.floor(Math.random() * 300);
  rpcUrl = `http://127.0.0.1:${port}`;
  anvil = spawn('anvil', ['--port', String(port), '--silent'], { stdio: 'ignore' });
  rpc = createRpc(rpcUrl);
  for (let i = 0; i < 100; i++) {
    try {
      await rpc('eth_chainId');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  accounts = await rpc('eth_accounts');
  run('forge', ['build'], { cwd: kit });
  mock = create(mockPkg, 'src/ReceptorMock.sol:ReceptorMock');
  const roles = `(${accounts[0]},${accounts[0]},${accounts[0]},${accounts[0]})`;
  token = create(kit, 'src/GatedERC20.sol:GatedERC20', ['Gated', 'GTOK', roles, mock, '1', '100000000000000000000']);

  webhook = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(JSON.parse(body));
      res.statusCode = 204;
      res.end();
    });
  });
  await new Promise((r) => webhook.listen(0, '127.0.0.1', r));
});

after(() => {
  anvil?.kill();
  webhook?.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('the first poll only records the head; the next poll decodes every watched event in order', async () => {
  const delivered = [];
  const state = { lastBlock: null };
  const opts = { rpc, contract: token, network: 'testnet', explorerUrl: 'https://redbelly.testnet.routescan.io', state, minSeverity: 'info', deliver: async (a) => delivered.push(a), log: () => {} };
  const first = await pollOnce(opts);
  assert.equal(first.alerts.length, 0);
  assert.equal(state.lastBlock, first.head);

  const [admin, alice, bob] = accounts;
  const until = Math.floor(Date.now() / 1000) + 86_400;
  send(admin, token, 'setIssuer(address,uint64,uint64,uint256)', admin, '0', String(until), '1000000000000000000000000');
  send(admin, mock, 'setStatus(address,uint64,uint8)', alice, '1', '1');
  send(admin, mock, 'setStatus(address,uint64,uint8)', bob, '1', '1');
  send(admin, token, 'mint(address,uint256)', alice, '50000000000000000000');
  send(admin, token, 'pause()');
  send(admin, token, 'unpause()');
  send(admin, mock, 'setStatus(address,uint64,uint8)', alice, '1', '3'); // Revoked
  const hash = '0x' + 'ab'.repeat(32);
  send(admin, token, 'forceTransfer(address,address,uint256,bytes32)', alice, bob, '50000000000000000000', hash);
  const complianceRole = run('cast', ['keccak', 'COMPLIANCE_ROLE']).trim();
  send(admin, token, 'grantRole(bytes32,address)', complianceRole, bob);
  send(admin, token, 'revokeRole(bytes32,address)', complianceRole, bob);
  send(admin, token, 'setRequestId(uint64)', '2');
  const mock2 = create(mockPkg, 'src/ReceptorMock.sol:ReceptorMock');
  send(admin, token, 'setVerifier(address)', mock2);
  send(admin, token, 'revokeIssuer(address)', admin);

  const second = await pollOnce(opts);
  assert.equal(state.lastBlock, second.head);
  const names = delivered.map((a) => a.event);
  assert.deepEqual(names, [
    'IssuerPermissionSet',
    'Paused',
    'Unpaused',
    'ForcedTransfer',
    'RoleGranted',
    'RoleRevoked',
    'RequestIdChanged',
    'VerifierChanged',
    'IssuerPermissionRevoked',
  ]);
  const forced = delivered.find((a) => a.event === 'ForcedTransfer');
  assert.equal(forced.severity, 'critical');
  assert.equal(forced.args.from.toLowerCase(), alice.toLowerCase());
  assert.equal(forced.args.to.toLowerCase(), bob.toLowerCase());
  assert.equal(forced.args.amount, '50000000000000000000');
  assert.equal(forced.args.justificationHash, hash);
  assert.equal(forced.args.officer.toLowerCase(), admin.toLowerCase());
  assert.match(forced.explorerUrl, /^https:\/\/redbelly\.testnet\.routescan\.io\/tx\/0x[0-9a-f]{64}$/);
  const granted = delivered.find((a) => a.event === 'RoleGranted');
  assert.equal(granted.args.role, 'COMPLIANCE_ROLE');
  assert.equal(granted.args.account.toLowerCase(), bob.toLowerCase());
  const rid = delivered.find((a) => a.event === 'RequestIdChanged');
  assert.deepEqual(rid.args, { previousRequestId: '1', newRequestId: '2' });
  const ver = delivered.find((a) => a.event === 'VerifierChanged');
  assert.equal(ver.args.newVerifier.toLowerCase(), mock2.toLowerCase());
  assert.equal(ver.args.previousVerifier.toLowerCase(), mock.toLowerCase());
  const issuer = delivered.find((a) => a.event === 'IssuerPermissionSet');
  assert.equal(issuer.severity, 'warning');
  assert.equal(issuer.args.allowance, '1000000000000000000000000');
  assert.equal(issuer.args.validUntil, new Date(until * 1000).toISOString());
  // Plain transfers, mints and approvals are not alerts.
  assert.ok(!names.includes('Transfer'));

  // A third poll with nothing new posts nothing.
  const third = await pollOnce(opts);
  assert.equal(third.alerts.length, 0);
});

test('min-severity filters: warning drops EligibilityDenied, critical drops issuer changes', async () => {
  const [admin, alice] = accounts;
  const state = { lastBlock: Number(BigInt(await rpc('eth_blockNumber'))) };
  const until = Math.floor(Date.now() / 1000) + 86_400;
  send(admin, token, 'setIssuer(address,uint64,uint64,uint256)', admin, '0', String(until), '1000000000000000000000000');
  send(admin, token, 'distribute(address[],uint256[])', `[${alice}]`, '[1]'); // alice is Revoked under request 1; token now on request 2 => NeverIssued
  const collect = async (minSeverity) => {
    const got = [];
    const s = { lastBlock: state.lastBlock };
    await pollOnce({ rpc, contract: token, network: 'testnet', state: s, minSeverity, deliver: async (a) => got.push(a.event), log: () => {} });
    return got;
  };
  assert.deepEqual(await collect('info'), ['IssuerPermissionSet', 'EligibilityDenied']);
  assert.deepEqual(await collect('warning'), ['IssuerPermissionSet']);
  assert.deepEqual(await collect('critical'), []);
});

test('the script posts to ALERT_WEBHOOK_URL with --once and keeps its place in the state file', async () => {
  const [admin] = accounts;
  const stateFile = join(tmp, 'state.json');
  const env = { ...process.env, ALERT_WEBHOOK_URL: `http://127.0.0.1:${webhook.address().port}/hook` };
  const head = Number(BigInt(await rpc('eth_blockNumber')));
  // First run: only records the head.
  let r = await runScript(['--contract', token, '--rpc', rpcUrl, '--once', '--state', stateFile], env);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).lastBlock, head);
  send(admin, token, 'pause()');
  send(admin, token, 'unpause()');
  received.length = 0;
  r = await runScript(['--contract', token, '--rpc', rpcUrl, '--once', '--state', stateFile, '--json'], env);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(received.map((a) => a.event), ['Paused', 'Unpaused']);
  assert.equal(r.stdout.trim().split('\n').length, 2);
  assert.ok(!(r.stdout + r.stderr).includes('/hook'), 'the webhook URL is never printed');
  assert.match(r.stderr, /2 alert\(s\) posted/);
  // Dry run posts nothing and prints JSON lines; state still advances.
  send(admin, token, 'pause()');
  received.length = 0;
  r = await runScript(['--contract', token, '--rpc', rpcUrl, '--once', '--state', stateFile, '--dry-run'], { ...process.env, ALERT_WEBHOOK_URL: '' });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(received.length, 0);
  assert.equal(JSON.parse(r.stdout.trim()).event, 'Paused');
  send(admin, token, 'unpause()');
  // Without a webhook and without --dry-run the script refuses.
  r = await runScript(['--contract', token, '--rpc', rpcUrl, '--once', '--state', stateFile], { ...process.env, ALERT_WEBHOOK_URL: '' });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /ALERT_WEBHOOK_URL/);
});

test('topic hashes match cast sig-event as recorded on 12 September 2026', () => {
  assert.equal(topicsByName.Paused, '0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258');
  assert.equal(topicsByName.ForcedTransfer, '0x1b85cbe6254fe63f9d978161eb56b79af008c1d5d8d7cacedd79975116951c98');
  assert.equal(topicsByName.RoleGranted, '0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d');
  assert.equal(topicsByName.VerifierChanged, '0x0ddda8be1021ab00f63727c5c5504ad96b163269770a3fe8ac3dd0bcb40208df');
  assert.equal(topicsByName.RequestIdChanged, '0x1058786e55685043822906869be4e9767dc902f3bd5e4f04ee2c5a59f6fc7a5e');
  assert.equal(topicsByName.EligibilityDenied, '0x1efe89417573a1b61f67268e3e1afc106c62e0c4cbcb13f3ce7629aaba4b5a19');
});
