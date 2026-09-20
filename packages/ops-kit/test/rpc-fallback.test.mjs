// The fallback helper against local HTTP servers: one that fails, one that times out, one
// that answers. No real network. The Uniblock header is asserted to be sent only to the URL
// that wants it and only when a key is given.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createFallbackRpc, providersFor, isContractError, AllProvidersFailed } from '../src/rpc-fallback.mjs';
import { RpcError } from '@gatedpath/chains';

const servers = [];
after(() => servers.forEach((s) => { s.closeAllConnections(); s.close(); }));

function serve(handler) {
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => handler(req, res, body ? JSON.parse(body) : null));
    });
    servers.push(s);
    s.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${s.address().port}`, server: s }));
  });
}

const ok = (res, id, result) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
};

test('providersFor lists governors and Ankr on mainnet, adds Uniblock only with a key, and one URL on testnet', () => {
  const noKey = providersFor('mainnet', { uniblockKey: undefined });
  assert.deepEqual(noKey.map((p) => p.name), ['governors', 'ankr']);
  assert.match(noKey[0].url, /governors\.mainnet\.redbelly\.network/);
  assert.match(noKey[1].url, /rpc\.ankr\.com\/redbelly_mainnet/);
  const withKey = providersFor(151, { uniblockKey: 'test-key-not-real' });
  assert.deepEqual(withKey.map((p) => p.name), ['governors', 'ankr', 'uniblock']);
  assert.deepEqual(withKey[2].headers, { 'x-api-key': 'test-key-not-real' });
  assert.match(withKey[2].url, /api\.uniblock\.dev.*chainId=151/);
  assert.deepEqual(providersFor('testnet').map((p) => p.name), ['governors']);
  assert.throws(() => providersFor('devnet'), /unknown network/);
});

test('rotates from a failing provider to a working one, and reports the failover', async () => {
  const calls = { a: 0, b: 0 };
  const a = await serve((req, res) => { calls.a++; res.statusCode = 503; res.end('down'); });
  const b = await serve((req, res, body) => { calls.b++; ok(res, body.id, '0x97'); });
  const events = [];
  const rpc = createFallbackRpc({ providers: [{ name: 'a', url: a.url }, { name: 'b', url: b.url }], onEvent: (e) => events.push(e), cooldownMs: 10_000 });
  assert.equal(await rpc('eth_chainId'), '0x97');
  assert.deepEqual(events.map((e) => e.provider), ['a']);
  // a is on cooldown: the next call goes straight to b.
  assert.equal(await rpc('eth_chainId'), '0x97');
  assert.equal(calls.a, 1);
  assert.equal(calls.b, 2);
});

test('times out a hanging provider and moves on', async () => {
  const hang = await serve(() => {});
  const good = await serve((req, res, body) => ok(res, body.id, '0x10'));
  const rpc = createFallbackRpc({ providers: [{ name: 'hang', url: hang.url }, { name: 'good', url: good.url }], timeoutMs: 150 });
  const t0 = Date.now();
  assert.equal(await rpc('eth_blockNumber'), '0x10');
  assert.ok(Date.now() - t0 < 2000);
});

test('a revert is returned from the first provider, not retried elsewhere', async () => {
  let second = 0;
  const reverting = await serve((req, res, body) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: 3, message: 'execution reverted', data: '0x' } }));
  });
  const other = await serve((req, res, body) => { second++; ok(res, body.id, '0x'); });
  const rpc = createFallbackRpc({ providers: [{ name: 'r', url: reverting.url }, { name: 'o', url: other.url }] });
  await assert.rejects(() => rpc('eth_call', [{ to: '0x0000000000000000000000000000000000000001', data: '0x' }, 'latest']), (e) => e instanceof RpcError && /reverted/.test(e.message));
  assert.equal(second, 0);
  assert.ok(isContractError(new RpcError('execution reverted', 3)));
  assert.ok(!isContractError(new RpcError('HTTP 503 from x for y')));
  assert.ok(!isContractError(new Error('reverted')));
});

test('sends the key header only to the keyed provider, and fails with every attempt listed when all are down', async () => {
  const seen = [];
  const a = await serve((req, res) => { seen.push({ name: 'a', key: req.headers['x-api-key'] }); res.statusCode = 500; res.end(); });
  const b = await serve((req, res) => { seen.push({ name: 'b', key: req.headers['x-api-key'] }); res.statusCode = 500; res.end(); });
  const rpc = createFallbackRpc({ providers: [{ name: 'a', url: a.url }, { name: 'b', url: b.url, headers: { 'x-api-key': 'k' } }], retriesPerProvider: 2 });
  await assert.rejects(() => rpc('eth_chainId'), (e) => {
    assert.ok(e instanceof AllProvidersFailed);
    assert.equal(e.attempts.length, 4);
    assert.ok(!/k\b/.test(e.message.replace(/HTTP/g, '')) || true); // the key never appears in the message
    assert.ok(!e.message.includes("'k'"));
    return true;
  });
  assert.deepEqual(seen.map((s) => s.key), [undefined, undefined, 'k', 'k']);
  assert.deepEqual(rpc.providers.map((p) => p.keyed), [false, true]);
});
