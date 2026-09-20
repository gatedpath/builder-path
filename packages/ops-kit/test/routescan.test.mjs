// The Routescan client against a local server that replays the response shapes recorded from
// the real API on 12 September 2026 (fixtures/). With OPS_KIT_LIVE=1 the same assertions run
// against api.routescan.io for WRBNT on mainnet, read-only and paced.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRoutescan, explorerFor, formatAmount, normaliseTransfer } from '../src/routescan.mjs';

const fixtures = new URL('./fixtures/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, fixtures), 'utf8'));
const WRBNT = '0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076';
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

const servers = [];
after(() => servers.forEach((s) => { s.closeAllConnections(); s.close(); }));

async function fakeRoutescan() {
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(req.url);
    res.setHeader('content-type', 'application/json');
    const u = new URL(req.url, 'http://x');
    if (u.pathname.endsWith('/etherscan/api')) {
      const action = u.searchParams.get('action');
      if (action === 'tokentx') return res.end(JSON.stringify(load('tokentx.json')));
      if (action === 'getsourcecode') {
        const a = u.searchParams.get('address').toLowerCase();
        return res.end(JSON.stringify(a === MULTICALL3.toLowerCase() ? load('getsourcecode-verified.json') : load('getsourcecode-unverified.json')));
      }
      if (action === 'getLogs') return res.end(JSON.stringify(load('getlogs.json')));
      res.statusCode = 404;
      return res.end('{}');
    }
    if (/\/erc20\/0x[0-9a-fA-F]{40}\/holders$/.test(u.pathname)) return res.end(JSON.stringify(load('holders.json')));
    res.statusCode = 404;
    res.end(JSON.stringify({ statusCode: 404 }));
  });
  servers.push(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const doFetch = (url, init) => globalThis.fetch(url.replace(/^https:\/\/api\.routescan\.io/, base), init);
  return { hits, doFetch };
}

const live = process.env.OPS_KIT_LIVE === '1';

test('explorerFor derives both API surfaces from the chain definition', () => {
  const ex = explorerFor('mainnet');
  assert.equal(ex.etherscan, 'https://api.routescan.io/v2/network/mainnet/evm/151/etherscan/api');
  assert.equal(ex.native, 'https://api.routescan.io/v2/network/mainnet/evm/151');
  assert.equal(ex.web, 'https://redbelly.routescan.io');
  assert.equal(explorerFor(153).web, 'https://redbelly.testnet.routescan.io');
});

test('tokenTransfers returns normalised rows, newest first', async () => {
  const { doFetch } = live ? { doFetch: globalThis.fetch } : await fakeRoutescan();
  const rs = createRoutescan('mainnet', { fetch: doFetch, paceMs: live ? 600 : 0 });
  const rows = await rs.tokenTransfers(WRBNT, { limit: 5 });
  assert.ok(rows.length > 0 && rows.length <= 5);
  for (const r of rows) {
    assert.equal(typeof r.blockNumber, 'number');
    assert.match(r.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(r.hash, /^0x[0-9a-f]{64}$/);
    assert.equal(typeof r.value, 'bigint');
    assert.equal(r.tokenSymbol, 'WRBNT');
    assert.equal(r.tokenDecimal, 18);
  }
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].blockNumber >= rows[i].blockNumber, 'newest first');
  assert.equal(rs.calls, 1);
});

test('holders returns balances and shares, largest first', async () => {
  const { doFetch } = live ? { doFetch: globalThis.fetch } : await fakeRoutescan();
  const rs = createRoutescan('mainnet', { fetch: doFetch, paceMs: live ? 600 : 0 });
  const rows = await rs.holders(WRBNT, { limit: 3 });
  assert.equal(rows.length, 3);
  assert.match(rows[0].address, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(typeof rows[0].balance, 'bigint');
  assert.ok(rows[0].balance >= rows[1].balance && rows[1].balance >= rows[2].balance);
  assert.ok(rows[0].share > 0 && rows[0].share <= 1);
});

test('verifiedSource reads a verified contract and reports an unverified one honestly', async () => {
  const { doFetch } = live ? { doFetch: globalThis.fetch } : await fakeRoutescan();
  const rs = createRoutescan('mainnet', { fetch: doFetch, paceMs: live ? 600 : 0 });
  const yes = await rs.verifiedSource(MULTICALL3);
  assert.equal(yes.verified, true);
  assert.equal(yes.name, 'Multicall3');
  assert.match(yes.compiler, /0\.8\.12/);
  assert.equal(yes.url, `https://redbelly.routescan.io/address/${MULTICALL3}/contract/code`);
  // The bootstrap registry has no verified source on either network (RESEARCH.md, chain-definitions rows).
  const no = await rs.verifiedSource('0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5');
  assert.equal(no.verified, false);
  assert.match(no.url, /contract\/code$/);
});

test('logs returns raw rows through the Etherscan module', async () => {
  const { doFetch } = live ? { doFetch: globalThis.fetch } : await fakeRoutescan();
  const rs = createRoutescan('mainnet', { fetch: doFetch, paceMs: live ? 600 : 0 });
  const rows = await rs.logs(WRBNT, { fromBlock: 3179000, toBlock: 3179592, topic0: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', limit: 2 });
  assert.ok(rows.length >= 1);
  assert.equal(rows[0].topics[0], '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
});

test('pacing keeps keyless calls at or under two a second', async () => {
  const { doFetch } = await fakeRoutescan();
  const rs = createRoutescan('mainnet', { fetch: doFetch });
  const t0 = Date.now();
  await rs.holders(WRBNT, { limit: 1 });
  await rs.holders(WRBNT, { limit: 1 });
  await rs.holders(WRBNT, { limit: 1 });
  assert.ok(Date.now() - t0 >= 1150, 'three calls take at least two pacing gaps');
});

test('normaliseTransfer and formatAmount', () => {
  const row = normaliseTransfer({ blockNumber: '5', timeStamp: '1789207209', hash: '0xab', from: '0x1', to: '0x2', value: '801781504296904707582', tokenSymbol: 'WRBNT', tokenDecimal: '18', gasUsed: '63327', gasPrice: '196043835401595' });
  assert.equal(row.timestamp, new Date(1789207209 * 1000).toISOString());
  assert.equal(formatAmount(row.value, 18), '801.781504296904707582');
  assert.equal(formatAmount(1000n, 0), '1000');
  assert.equal(formatAmount(1000000n, 6), '1');
  assert.equal(formatAmount(1500000n, 6), '1.5');
  assert.equal(formatAmount(5n, 6), '0.000005');
});
