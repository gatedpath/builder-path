// Live tests against both governors RPCs. Read-only: eth_chainId, eth_getCode, eth_call,
// eth_getBlockByNumber. Override endpoints with RBN_MAINNET_RPC / RBN_TESTNET_RPC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chains, addresses, knownAllowed, isAllowed, getLatestPrice, getPriceFeedDecimals, gasCostUsd,
  resolveRegistry, resolveAllRegistryNames, networkOf, createRpc, keyedRpcs,
} from '../dist/esm/index.js';

const endpoints = {
  mainnet: process.env.RBN_MAINNET_RPC ?? chains.mainnet.rpcUrls.default.http[0],
  testnet: process.env.RBN_TESTNET_RPC ?? chains.testnet.rpcUrls.default.http[0],
};

for (const [net, url] of Object.entries(endpoints)) {
  const rpc = createRpc(url);
  const chain = chains[net];
  const book = addresses[net];

  test(`${net}: eth_chainId is ${chain.id} at ${url}`, async () => {
    assert.equal(Number(BigInt(await rpc('eth_chainId'))), chain.id);
    assert.equal(await networkOf(rpc), net);
  });

  test(`${net}: eth_getCode is non-empty for every recorded address`, async () => {
    const lines = [];
    for (const [name, entry] of Object.entries(book)) {
      const code = await rpc('eth_getCode', [entry.address, 'latest']);
      const bytes = (code.length - 2) / 2;
      lines.push(`${name.padEnd(24)} ${entry.address} ${bytes} bytes`);
      assert.ok(bytes > 0, `${net}.${name} at ${entry.address} has no code`);
    }
    console.log(lines.join('\n'));
  });

  test(`${net}: every chain.contracts entry is in addresses`, () => {
    for (const [name, c] of Object.entries(chain.contracts)) assert.equal(c.address, book[name].address, name);
  });

  test(`${net}: registry resolves permission, pricefeed, gasfees to the recorded addresses`, async () => {
    const all = await resolveAllRegistryNames({ rpc });
    console.log(all);
    assert.equal(all.permission, book.permission.address);
    assert.equal(all.pricefeed, book.pricefeed.address);
    assert.equal(all.gasfees, book.gasfees.address);
    assert.equal(await resolveRegistry('no-such-name', { rpc }), null);
  });

  test(`${net}: isAllowed is false for the zero address and true for the known allowed address`, async () => {
    assert.equal(await isAllowed('0x0000000000000000000000000000000000000000', { rpc }), false);
    assert.equal(await isAllowed(knownAllowed[net].address, { rpc }), true);
  });

  test(`${net}: getLatestPrice is positive, six decimals, timestamp within a day`, async () => {
    const p = await getLatestPrice({ rpc });
    console.log({ usdPerRbnt: p.usdPerRbnt, raw: p.raw, timestamp: p.timestamp, iso: new Date(p.timestamp * 1000).toISOString(), returnWords: (p.returnData.length - 2) / 64 });
    assert.ok(p.usdPerRbnt > 0);
    assert.ok(p.raw > 0n);
    assert.ok(Math.abs(Date.now() / 1000 - p.timestamp) < 86_400, 'price timestamp older than a day');
    assert.equal(await getPriceFeedDecimals({ rpc }), 6);
  });

  test(`${net}: a 21,000-gas transfer costs about US$0.01`, async () => {
    const c = await gasCostUsd({ gasUsed: 21_000, rpc });
    console.log({ usd: c.usd, rbnt: c.rbnt, gasPriceWei: c.gasPriceWei, usdPerRbnt: c.usdPerRbnt });
    assert.ok(c.usd > 0.009 && c.usd < 0.011, `transfer priced at US$${c.usd}, expected 0.01`);
  });
}

test('mainnet: the Ankr public endpoint reports chain 151', async () => {
  const ankr = chains.mainnet.rpcUrls.public.http.find((u) => u.includes('ankr'));
  assert.ok(ankr);
  assert.equal(Number(BigInt(await createRpc(ankr)('eth_chainId'))), 151);
});

test('mainnet: Uniblock endpoint refuses a keyless call (documented as keyed)', async () => {
  const res = await fetch(keyedRpcs.mainnet.uniblock.url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
  });
  console.log({ uniblockKeylessStatus: res.status });
  assert.ok(res.status >= 400, `expected a 4xx without x-api-key, got ${res.status}`);
});
