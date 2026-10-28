// redbelly fees: the reads answered by a fake fetch with fixed values, the RBNT and cents arithmetic
// checked against hand-computed numbers, the text and JSON renderings, a chain that cannot be read,
// and the CLI's exit codes. No network, no anvil, no key.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { addresses, chainById } from '@gatedpath/chains';
import { HISTORY_BLOCKS_151, REFERENCE_CALLS, feesReportJson, priceCalls, readFeesChain, renderFeesText, runFees } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const redbelly = join(here, '..', 'dist', 'redbelly.js');

const MAINNET_RPC = chainById(151).rpcUrls.default.http[0];
const TESTNET_RPC = chainById(153).rpcUrls.default.http[0];

// The fixed world: base fee 200,000 gwei (2e14 wei), feed raw 2500 = US$0.0025 per RBNT, head 3,300,000.
const BASE_FEE = 200_000n * 10n ** 9n;
const PRICE_RAW = 2500n;
const HEAD = 3_300_000;
const HEAD_TIME = 1_792_000_000; // 2026-10-14T17:46:40Z
const FEED_TIME = 1_791_999_990;

const word = (n) => n.toString(16).padStart(64, '0');
const hex = (n) => '0x' + n.toString(16);

/** A fetch that answers JSON-RPC from the table above. Past blocks get a base fee that falls with height, so the history is not flat. */
function fakeFetch({ fail } = {}) {
  const calls = [];
  const doFetch = async (url, init) => {
    const req = JSON.parse(init.body);
    calls.push({ url, method: req.method, params: req.params });
    if (fail) throw new TypeError(fail);
    const net = url === MAINNET_RPC ? 'mainnet' : url === TESTNET_RPC ? 'testnet' : null;
    assert.ok(net, `unexpected URL ${url}`);
    const reply = (result) => new Response(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
    switch (req.method) {
      case 'eth_chainId': return reply(hex(net === 'mainnet' ? 151 : 153));
      case 'eth_getBlockByNumber': {
        const tag = req.params[0];
        if (tag === 'latest') return reply({ number: hex(HEAD), timestamp: hex(HEAD_TIME), baseFeePerGas: hex(BASE_FEE) });
        const height = Number(BigInt(tag));
        if (height > HEAD) return reply(null);
        // Older blocks had a higher base fee in RBNT: twice today's at genesis, falling to today's at the head.
        const fee = height === HEAD ? BASE_FEE : BASE_FEE * 2n - (BASE_FEE * BigInt(height)) / BigInt(HEAD);
        return reply({ number: hex(height), timestamp: hex(HEAD_TIME - (HEAD - height) * 20), baseFeePerGas: hex(fee) });
      }
      case 'eth_call': {
        const to = req.params[0].to.toLowerCase();
        const feed = addresses[net].pricefeed.address;
        if (to === addresses[net].bootstrapRegistry.address.toLowerCase()) return reply('0x' + feed.slice(2).toLowerCase().padStart(64, '0'));
        if (to === feed.toLowerCase()) return reply('0x' + word(PRICE_RAW) + word(FEED_TIME));
        throw new Error(`eth_call to an unexpected address ${to}`);
      }
      default: throw new Error(`unexpected method ${req.method}`);
    }
  };
  return Object.assign(doFetch, { calls });
}

test('priceCalls: the four measured calls at 200,000 gwei and US$0.0025 per RBNT, by hand', () => {
  const rows = priceCalls({ baseFeeWei: BASE_FEE, priceRaw: PRICE_RAW });
  assert.deepEqual(rows.map((r) => r.key), ['transfer', 'guard', 'token', 'enable']);
  // transfer: 21,000 * 2e14 wei = 4.2e18 wei = 4.2 RBNT; 4.2 * 0.0025 = US$0.0105 = 1.05 cents.
  assert.equal(Number(rows[0].rbnt), 4.2);
  assert.equal(rows[0].cents, 1.05);
  assert.equal(rows[0].usd, 0.0105);
  // guard: 503,685 * 2e14 = 1.00737e20 wei = 100.737 RBNT; * 0.0025 = US$0.2518425 = 25.18425 cents, truncated to 25.184.
  assert.equal(Number(rows[1].rbnt), 100.737);
  assert.equal(rows[1].cents, 25.184);
  // token: 1,971,486 * 2e14 = 3.942972e20 wei = 394.2972 RBNT; * 0.0025 = US$0.985743 = 98.5743 cents, truncated to 98.574.
  assert.equal(Number(rows[2].rbnt), 394.2972);
  assert.equal(rows[2].cents, 98.574);
  // enable: 2,154,375 * 2e14 = 4.30875e20 wei = 430.875 RBNT; * 0.0025 = US$1.0771875 = 107.71875 cents, truncated to 107.718.
  assert.equal(Number(rows[3].rbnt), 430.875);
  assert.equal(rows[3].cents, 107.718);
  assert.equal(rows[3].usd, 1.0771875);
  assert.equal(rows[3].wei, 2_154_375n * BASE_FEE);
  for (const r of rows) assert.equal(r.wei, r.gas * BASE_FEE);
});

test('readFeesChain on mainnet: the quote, the calls, and the history priced for the enable call', async () => {
  const doFetch = fakeFetch();
  const r = await readFeesChain(MAINNET_RPC, 151, { fetch: doFetch });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.chain, 151);
  assert.equal(r.network, 'mainnet');
  assert.equal(r.quote.block, HEAD);
  assert.equal(r.quote.blockTimestamp, new Date(HEAD_TIME * 1000).toISOString());
  assert.equal(r.quote.baseFeeWei, BASE_FEE);
  assert.equal(r.quote.usdPerRbnt, 0.0025);
  assert.equal(r.quote.priceTimestamp, new Date(FEED_TIME * 1000).toISOString());
  assert.equal(r.quote.priceFeed, addresses.mainnet.pricefeed.address);
  assert.equal(r.calls.length, REFERENCE_CALLS.length);
  assert.equal(r.calls[3].cents, 107.718);
  // The history: the nine heights below the head plus the head itself, oldest first.
  assert.equal(r.historyError, null);
  assert.deepEqual(r.history.map((p) => p.block), [...HISTORY_BLOCKS_151, HEAD]);
  const genesis = r.history[0];
  // Block 204 base fee from the fake: 2 * 2e14 - (2e14 * 204) / 3,300,000 = 399,987,636,363,637 wei (integer division).
  assert.equal(genesis.baseFeeWei, 2n * BASE_FEE - (BASE_FEE * 204n) / BigInt(HEAD));
  assert.equal(genesis.baseFeeWei, 399_987_636_363_637n);
  // 2,154,375 gas at that fee = 861,723,364,090,910,461,875 wei = 861.723364090910461875 RBNT.
  assert.equal(2_154_375n * genesis.baseFeeWei, 861_723_364_090_910_461_875n);
  assert.ok(Math.abs(Number(genesis.rbnt) - 861.723364090910461875) < 1e-9);
  const last = r.history[r.history.length - 1];
  assert.equal(Number(last.rbnt), 430.875, 'the head point is today\'s enable cost');
  // The dollar line is the fixed rate: 2,154,375 * 0.01 / 21,000 = US$1.0258928...
  for (const p of r.history) assert.ok(Math.abs(p.usd - 1.025892857) < 1e-9);
  // Reads: chainId, latest block, registry, feed, then one block per height.
  assert.deepEqual(doFetch.calls.slice(0, 4).map((c) => c.method), ['eth_chainId', 'eth_getBlockByNumber', 'eth_call', 'eth_call']);
  assert.equal(doFetch.calls.length, 4 + HISTORY_BLOCKS_151.length + 1);
});

test('runFees reads both chains; testnet has no history; the text and the JSON carry the hand-computed figures', async () => {
  const doFetch = fakeFetch();
  const report = await runFees({ fetch: doFetch });
  assert.equal(report.tool, 'redbelly-fees');
  assert.equal(report.ok, true);
  assert.deepEqual(report.chains.map((c) => c.chain), [151, 153]);
  assert.equal(report.chains[1].history, null);
  assert.equal(report.chains[1].quote.priceFeed, addresses.testnet.pricefeed.address);
  const text = renderFeesText(report);
  assert.match(text, /^redbelly fees \d+\.\d+\.\d+  \d{4}-\d{2}-\d{2} /);
  assert.match(text, /^chain 151 \(mainnet\) via https:\/\/governors\.mainnet\.redbelly\.network  read in \d+ ms$/m);
  assert.match(text, /^head block 3,300,000 at 2026-10-14 17:46:40 UTC  base fee 200,000\.00 gwei$/m);
  assert.match(text, /^RBNT US\$0\.002500 from the feed at 2026-10-14 17:46:30 UTC$/m);
  assert.match(text, /^A native transfer\s+21,000\s+4\.200\s+1\.050$/m);
  assert.match(text, /^Deploying the recipient guard \(project 13\)\s+503,685\s+100\.737\s+25\.184$/m);
  assert.match(text, /^Deploying the gated token \(the scaffold\)\s+1,971,486\s+394\.297\s+98\.574$/m);
  assert.match(text, /^Enabling a wallet on the network\s+2,154,375\s+430\.875\s+107\.718$/m);
  assert.match(text, /^enable: 2,154,375 gas = 430\.875 RBNT = US\$1\.0772 now; at the network's fixed rate of US\$0\.01 per 21,000 gas it is US\$1\.03, whatever RBNT trades at\.$/m);
  assert.match(text, /^the enable call across mainnet's life/m);
  assert.match(text, /^\s+204\s+\d{4}-\d{2}-\d{2}\s+399,987\.64 gwei\s+861\.723\s+1\.03$/m);
  assert.match(text, /^chain 153 \(testnet\) via https:\/\/governors\.testnet\.redbelly\.network/m);
  assert.equal((text.match(/^head block 3,300,000/gm) ?? []).length, 2);
  assert.equal((text.match(/the enable call across/g) ?? []).length, 1, 'history on mainnet only');
  assert.ok(!text.includes('!'));
  assert.ok(!text.includes('—'), 'no em dashes');
  const j = JSON.parse(feesReportJson(report));
  assert.equal(j.chains[0].quote.baseFeeWei, BASE_FEE.toString(), 'BigInt as a decimal string');
  assert.equal(j.chains[0].calls[0].gas, '21000');
  assert.equal(j.chains[0].calls[3].cents, 107.718);
  assert.equal(j.chains[0].history[0].baseFeeWei, '399987636363637');
  assert.equal(j.ok, true);
});

test('--chain 153 reads one chain; --rpc without --chain takes the chain the RPC reports; a mismatch is an error', async () => {
  const one = await runFees({ chain: 153, fetch: fakeFetch() });
  assert.deepEqual(one.chains.map((c) => c.chain), [153]);
  const byRpc = await runFees({ rpc: MAINNET_RPC, fetch: fakeFetch(), history: false });
  assert.equal(byRpc.chains[0].chain, 151);
  assert.equal(byRpc.chains[0].history, null);
  const mismatch = await runFees({ rpc: TESTNET_RPC, chain: 151, fetch: fakeFetch() });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.chains[0].ok, false);
  assert.match(mismatch.chains[0].error, /--chain 151 but the RPC .* reports 153/);
});

test('a chain that cannot be read is a result, not a throw, and the report says which and why', async () => {
  const report = await runFees({ fetch: fakeFetch({ fail: 'fetch failed' }) });
  assert.equal(report.ok, false);
  assert.deepEqual(report.chains.map((c) => c.ok), [false, false]);
  assert.equal(report.chains[0].chain, 151);
  assert.equal(report.chains[0].network, 'mainnet');
  assert.match(report.chains[0].error, /fetch failed/);
  const text = renderFeesText(report);
  assert.match(text, /^chain 151 \(mainnet\) via .*: could not be read: fetch failed$/m);
  assert.match(text, /^chain 153 \(testnet\) via .*: could not be read: fetch failed$/m);
  assert.equal(JSON.parse(feesReportJson(report)).chains[1].error, 'fetch failed');
});

test('the CLI: --help exits 0, a bad flag exits 2, a key-shaped argument exits 2, an RPC that refuses exits 1 naming the chain', () => {
  const help = spawnSync(process.execPath, [redbelly, 'fees', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^redbelly fees \[options\]/);
  const bad = spawnSync(process.execPath, [redbelly, 'fees', '--chain', '1'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--chain must be 151 or 153/);
  const unknown = spawnSync(process.execPath, [redbelly, 'fees', '--nope'], { encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown argument "--nope"/);
  const key = spawnSync(process.execPath, [redbelly, 'fees', 'ab'.repeat(32)], { encoding: 'utf8' });
  assert.equal(key.status, 2);
  assert.match(key.stderr, /looks like a private key/);
  // Port 1 on loopback is never listening, so the read fails at once without touching the network.
  const down = spawnSync(process.execPath, [redbelly, 'fees', '--chain', '153', '--rpc', 'http://127.0.0.1:1', '--json'], { encoding: 'utf8' });
  assert.equal(down.status, 1, down.stderr);
  assert.match(down.stderr, /^redbelly fees: chain 153 could not be read: /);
  const j = JSON.parse(down.stdout);
  assert.equal(j.ok, false);
  assert.equal(j.chains[0].ok, false);
  assert.equal(j.chains[0].chain, 153);
  const listed = spawnSync(process.execPath, [redbelly], { encoding: 'utf8' });
  assert.match(listed.stdout, /^  fees {8}what the measured calls cost/m);
});
