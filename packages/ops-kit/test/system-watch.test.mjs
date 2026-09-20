// The system-contract watcher against a scripted chain: a function that answers eth_call,
// eth_getCode, eth_getStorageAt, eth_blockNumber and eth_getLogs from a small mutable model.
// No network, no Foundry. Each test changes one thing on the model and checks the watcher says
// exactly that, once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { keccak256Hex, selectors, addresses } from '@gatedpath/chains';
import {
  takeSnapshot,
  diffSnapshots,
  readSystemLogs,
  watchOnce,
  SYSTEM_EVENTS,
  EIP1967,
  LOG_WINDOW,
} from '../src/system-watch.mjs';

const REGISTRY = addresses.testnet.bootstrapRegistry.address.toLowerCase();
const A = (n) => '0x' + n.toString(16).padStart(40, '0');
const word = (hex) => '0x' + hex.replace(/^0x/, '').padStart(64, '0');
const OWNER_SELECTOR = '0x8da5cb5b';

/** A chain small enough to read: three registry names, one proxy, a proxy admin with an owner. */
function model() {
  return {
    head: 1000,
    registry: { permission: A(0x10), pricefeed: A(0x20), gasfees: A(0x30) },
    code: { [REGISTRY]: '0x6001', [A(0x10)]: '0x6010', [A(0x11)]: '0x6011', [A(0x20)]: '0x6020', [A(0x30)]: '0x6030', [A(0x12)]: '0x6012' },
    storage: { [A(0x10)]: { [EIP1967.implementation]: word(A(0x11)), [EIP1967.admin]: word(A(0x12)) } },
    owner: { [A(0x12)]: A(0x99) },
    logs: [],
    calls: [],
  };
}

function decodeName(data) {
  const hex = data.slice(10);
  const length = Number(BigInt('0x' + hex.slice(64, 128)));
  return Buffer.from(hex.slice(128, 128 + length * 2), 'hex').toString('utf8');
}

function fakeRpc(m) {
  return async (method, params = []) => {
    m.calls.push({ method, params });
    if (method === 'eth_blockNumber') return '0x' + m.head.toString(16);
    if (method === 'eth_getCode') return m.code[params[0].toLowerCase()] ?? '0x';
    if (method === 'eth_getStorageAt') return m.storage[params[0].toLowerCase()]?.[params[1]] ?? word('0');
    if (method === 'eth_call') {
      const { to, data } = params[0];
      if (to.toLowerCase() === REGISTRY && data.startsWith(selectors.getContractAddress)) return word(m.registry[decodeName(data)] ?? '0');
      if (data.startsWith(OWNER_SELECTOR)) {
        const owner = m.owner[to.toLowerCase()];
        if (!owner) throw Object.assign(new Error('execution reverted'), { code: 3 });
        return word(owner);
      }
      throw new Error(`unexpected eth_call to ${to}`);
    }
    if (method === 'eth_getLogs') {
      const { address, fromBlock, toBlock, topics } = params[0];
      const from = Number(BigInt(fromBlock));
      const to = Number(BigInt(toBlock));
      if (to - from + 1 > LOG_WINDOW) throw new Error('block range too wide');
      const wanted = address.map((a) => a.toLowerCase());
      return m.logs.filter((l) => wanted.includes(l.address) && Number(l.blockNumber) >= from && Number(l.blockNumber) <= to && topics[0].includes(l.topics[0]));
    }
    throw new Error(`unexpected method ${method}`);
  };
}

const topicOf = (name) => SYSTEM_EVENTS.find((e) => e.name === name).topic;

test('a snapshot records the registry answers, code fingerprints and everything behind the permission proxy', async () => {
  const m = model();
  const snap = await takeSnapshot({ rpc: fakeRpc(m), network: 'testnet' });
  assert.equal(snap.network, 'testnet');
  assert.equal(snap.block, 1000);
  assert.equal(snap.contracts.registry.address.toLowerCase(), REGISTRY);
  assert.equal(snap.contracts.permission.address, A(0x10));
  assert.equal(snap.contracts.permission.codeHash, keccak256Hex(Buffer.from('6010', 'hex')));
  assert.equal(snap.contracts.permission.implementation, A(0x11));
  assert.equal(snap.contracts.permission.implementationCodeHash, keccak256Hex(Buffer.from('6011', 'hex')));
  assert.equal(snap.contracts.permission.proxyAdmin, A(0x12));
  assert.equal(snap.contracts.permission.proxyAdminOwner, A(0x99));
  // A plain contract has no proxy fields at all, so a diff never compares null with null.
  assert.equal(snap.contracts.pricefeed.implementation, null);
  assert.equal(snap.contracts.pricefeed.proxyAdmin, null);
  assert.equal(snap.contracts.gasfees.address, A(0x30));
});

test('two snapshots of an unchanged chain differ in nothing', async () => {
  const m = model();
  const before = await takeSnapshot({ rpc: fakeRpc(m), network: 'testnet' });
  m.head = 1050;
  const after = await takeSnapshot({ rpc: fakeRpc(m), network: 'testnet' });
  assert.deepEqual(diffSnapshots(before, after), []);
});

test('each kind of change is named once, with the old and new value', async () => {
  const cases = [
    ['RegistryEntryChanged', (m) => { m.registry.pricefeed = A(0x21); m.code[A(0x21)] = '0x6021'; }, { name: 'pricefeed', previous: A(0x20), current: A(0x21) }],
    ['ImplementationChanged', (m) => { m.storage[A(0x10)][EIP1967.implementation] = word(A(0x13)); m.code[A(0x13)] = '0x6013'; }, { name: 'permission', previous: A(0x11), current: A(0x13), detail: ['currentCodeHash', keccak256Hex(Buffer.from('6013', 'hex'))] }],
    ['ImplementationCodeChanged', (m) => { m.code[A(0x11)] = '0x60ee'; }, { name: 'permission' }],
    ['ProxyAdminChanged', (m) => { m.storage[A(0x10)][EIP1967.admin] = word(A(0x14)); m.owner[A(0x14)] = A(0x97); }, { name: 'permission', previous: A(0x12), current: A(0x14), detail: ['currentOwner', A(0x97)] }],
    ['ProxyAdminOwnerChanged', (m) => { m.owner[A(0x12)] = A(0x98); }, { name: 'permission', previous: A(0x99), current: A(0x98) }],
    ['CodeChanged', (m) => { m.code[A(0x30)] = '0x60ff'; }, { name: 'gasfees' }],
  ];
  for (const [event, change, expected] of cases) {
    const m = model();
    const before = await takeSnapshot({ rpc: fakeRpc(m), network: 'testnet' });
    change(m);
    m.head += 1;
    const alerts = diffSnapshots(before, await takeSnapshot({ rpc: fakeRpc(m), network: 'testnet' }), { explorerUrl: 'https://explorer.example' });
    assert.deepEqual(alerts.map((a) => a.event), [event], event);
    const [alert] = alerts;
    assert.equal(alert.severity, 'critical');
    assert.equal(alert.network, 'testnet');
    assert.equal(alert.blockNumber, 1001);
    assert.equal(alert.args.name, expected.name);
    if (expected.previous) assert.equal(alert.args.previous, expected.previous);
    if (expected.current) assert.equal(alert.args.current, expected.current);
    if (expected.detail) assert.equal(alert.args[expected.detail[0]], expected.detail[1]);
    assert.match(alert.explorerUrl, /^https:\/\/explorer\.example\/address\/0x/);
    assert.ok(alert.what.length > 20);
  }
});

test('a registry name that stops resolving is a change, not a crash', async () => {
  const m = model();
  const before = await takeSnapshot({ rpc: fakeRpc(m), network: 'testnet' });
  delete m.registry.gasfees;
  const alerts = diffSnapshots(before, await takeSnapshot({ rpc: fakeRpc(m), network: 'testnet' }));
  assert.deepEqual(alerts.map((a) => [a.event, a.args.name, a.args.current]), [['RegistryEntryChanged', 'gasfees', null]]);
});

test('logs are read in windows the RPC accepts, from the proxy and its admin, and decoded', async () => {
  const m = model();
  m.head = 1000 + LOG_WINDOW * 2 + 5;
  const sender = word(A(0x77));
  m.logs.push(
    { address: A(0x10), blockNumber: '0x' + (1001).toString(16), transactionHash: '0x' + 'a1'.repeat(32), logIndex: '0x0', topics: [topicOf('RoleGranted'), word('0'), word(A(0x55)), sender], data: '0x' },
    { address: A(0x10), blockNumber: '0x' + (1000 + LOG_WINDOW + 3).toString(16), transactionHash: '0x' + 'a2'.repeat(32), logIndex: '0x1', topics: [topicOf('Upgraded'), word(A(0x13))], data: '0x' },
    { address: A(0x12), blockNumber: '0x' + m.head.toString(16), transactionHash: '0x' + 'a3'.repeat(32), logIndex: '0x0', topics: [topicOf('OwnershipTransferred'), word(A(0x99)), word(A(0x98))], data: '0x' },
    // Not ours: another contract, and an event nobody asked for.
    { address: A(0x66), blockNumber: '0x' + (1002).toString(16), transactionHash: '0x' + 'a4'.repeat(32), logIndex: '0x0', topics: [topicOf('RoleGranted'), word('0'), word(A(0x55)), sender], data: '0x' },
  );
  const { alerts, scannedTo } = await readSystemLogs({ rpc: fakeRpc(m), addresses: [A(0x10), A(0x12)], from: 1001, to: m.head, network: 'testnet', explorerUrl: 'https://explorer.example' });
  assert.equal(scannedTo, m.head);
  assert.deepEqual(alerts.map((a) => a.event), ['RoleGranted', 'Upgraded', 'OwnershipTransferred']);
  assert.deepEqual(alerts[0].args, { role: 'DEFAULT_ADMIN_ROLE', account: A(0x55), sender: A(0x77) });
  assert.deepEqual(alerts[1].args, { implementation: A(0x13) });
  assert.deepEqual(alerts[2].args, { previousOwner: A(0x99), newOwner: A(0x98) });
  assert.equal(alerts[1].explorerUrl, 'https://explorer.example/tx/0x' + 'a2'.repeat(32));
  const windows = m.calls.filter((c) => c.method === 'eth_getLogs').map((c) => Number(BigInt(c.params[0].toBlock)) - Number(BigInt(c.params[0].fromBlock)) + 1);
  assert.equal(windows.length, 3);
  assert.ok(windows.every((w) => w <= LOG_WINDOW));
});

test('a long gap is caught up over several runs rather than in one burst', async () => {
  const m = model();
  m.head = 1000 + LOG_WINDOW * 10;
  const { scannedTo } = await readSystemLogs({ rpc: fakeRpc(m), addresses: [A(0x10)], from: 1001, to: m.head, network: 'testnet', maxWindows: 4 });
  assert.equal(scannedTo, 1000 + LOG_WINDOW * 4);
});

test('the first run keeps a baseline and says nothing; later runs report each change once', async () => {
  const m = model();
  const state = {};
  const delivered = [];
  const deliver = async (alert) => delivered.push(alert);
  const run = () => watchOnce({ rpc: fakeRpc(m), network: 'testnet', state, deliver, log: () => {} });

  assert.deepEqual((await run()).alerts, []);
  assert.equal(state.snapshot.block, 1000);
  assert.equal(state.lastBlock, 1000);

  m.head = 1010;
  assert.deepEqual((await run()).alerts, []);

  m.head = 1020;
  m.storage[A(0x10)][EIP1967.implementation] = word(A(0x13));
  m.code[A(0x13)] = '0x6013';
  m.logs.push({ address: A(0x10), blockNumber: '0x' + (1015).toString(16), transactionHash: '0x' + 'b1'.repeat(32), logIndex: '0x0', topics: [topicOf('Upgraded'), word(A(0x13))], data: '0x' });
  const third = await run();
  // The upgrade shows up twice on purpose: the event says when and in which transaction, the
  // snapshot says what the proxy points at now. An upgrade that emitted no event still shows.
  assert.deepEqual(third.alerts.map((a) => a.event).sort(), ['ImplementationChanged', 'Upgraded']);
  assert.equal(delivered.length, 2);

  m.head = 1030;
  assert.deepEqual((await run()).alerts, []);
  assert.equal(delivered.length, 2);
  assert.equal(state.snapshot.contracts.permission.implementation, A(0x13));
});

test('a failed delivery leaves the state where it was, so the alert is tried again', async () => {
  const m = model();
  const state = {};
  await watchOnce({ rpc: fakeRpc(m), network: 'testnet', state, deliver: async () => {}, log: () => {} });
  m.head = 1005;
  m.owner[A(0x12)] = A(0x98);
  await assert.rejects(watchOnce({ rpc: fakeRpc(m), network: 'testnet', state, deliver: async () => { throw new Error('webhook answered HTTP 500'); }, log: () => {} }), /HTTP 500/);
  assert.equal(state.lastBlock, 1000);
  assert.equal(state.snapshot.contracts.permission.proxyAdminOwner, A(0x99));
  const delivered = [];
  await watchOnce({ rpc: fakeRpc(m), network: 'testnet', state, deliver: async (a) => delivered.push(a), log: () => {} });
  assert.deepEqual(delivered.map((a) => a.event), ['ProxyAdminOwnerChanged']);
});

test('the script runs once against an RPC URL, writes its state file and prints changes as JSON lines', async () => {
  const m = model();
  const rpc = fakeRpc(m);
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const { id, method, params } = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      try {
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: await rpc(method, params) }));
      } catch (error) {
        res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: error.code ?? -32000, message: error.message } }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), 'system-watch-'));
  const statePath = join(dir, 'state.json');
  const script = fileURLToPath(new URL('../scripts/system-watch.mjs', import.meta.url));
  const runScript = () => new Promise((resolve) => {
    // spawnSync would block this process, and this process is the RPC server.
    import('node:child_process').then(({ spawn }) => {
      const child = spawn(process.execPath, [script, '--network', 'testnet', '--rpc', url, '--state', statePath, '--once', '--dry-run'], { env: { ...process.env, ALERT_WEBHOOK_URL: '' } });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c) => (stdout += c));
      child.stderr.on('data', (c) => (stderr += c));
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
  });
  try {
    const first = await runScript();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout.trim(), '');
    assert.match(first.stderr, /baseline/);
    assert.ok(existsSync(statePath));
    assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).snapshot.contracts.permission.implementation, A(0x11));

    m.head = 1002;
    m.registry.permission = A(0x15);
    m.code[A(0x15)] = '0x6015';
    const second = await runScript();
    assert.equal(second.status, 0, second.stderr);
    const lines = second.stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.event === 'RegistryEntryChanged' && l.args.name === 'permission' && l.args.current === A(0x15)));
  } finally {
    server.closeAllConnections();
    server.close();
  }
  assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0);
});

test('both pollers answer when started through a symlink from a folder with a space in its name', () => {
  // How npm installs a bin, and what a project folder on a Mac often looks like. Before isMain()
  // both scripts started, compared two differently spelled paths, and exited without a word.
  const dir = mkdtempSync(join(tmpdir(), 'ops kit with space-'));
  for (const name of ['system-watch', 'alert']) {
    const link = join(dir, `redbelly-${name}`);
    symlinkSync(fileURLToPath(new URL(`../scripts/${name}.mjs`, import.meta.url)), link);
    const run = spawnSync(process.execPath, [link, '--help'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Usage/, `${name} printed nothing`);
  }
});
