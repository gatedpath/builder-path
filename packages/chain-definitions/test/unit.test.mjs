// Offline tests: encoding, decoding, hashing, math. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  keccak256Hex, functionSelector, checksumAddress, selectors, signatures, assertSelectorsMatchSignatures,
  encodeAddress, encodeString, encodeUint256, encodeCall, decodeWords, decodeBool, decodeAddress,
  formatUnits, gasCostUsd, getLatestPrice, isAllowed, resolveRegistry, PRICE_FEED_DECIMALS,
  addresses, redbellyMainnet, redbellyTestnet, chainById, keyedRpcs, agentNotes, knownAllowed, registryNames, RpcError,
} from '../dist/esm/index.js';

test('keccak256 matches known vectors', () => {
  assert.equal(keccak256Hex(''), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(keccak256Hex('abc'), '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
  // 136 bytes is exactly one rate block; 137 forces a second permutation (vectors from viem)
  assert.equal(keccak256Hex('a'.repeat(136)), '0xa6c4d403279fe3e0af03729caada8374b5ca54d8065329a3ebcaeb4b60aa386e');
  assert.equal(keccak256Hex('a'.repeat(137)), '0xd869f639c7046b4929fc92a4d988a8b22c55fbadb802c0c66ebcd484f1915f39');
});

test('function selectors match the canonical signatures', () => {
  assertSelectorsMatchSignatures();
  assert.equal(functionSelector('transfer(address,uint256)'), '0xa9059cbb');
  assert.equal(functionSelector(signatures.isAllowed), '0xbabcc539');
  assert.equal(functionSelector(signatures.getContractAddress), '0x04433bbc');
  assert.equal(functionSelector(signatures.getLatestPrice), '0x8e15f473');
  assert.equal(selectors.decimals, '0x313ce567');
});

test('EIP-55 checksum vectors from the EIP', () => {
  assert.equal(checksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'), '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  assert.equal(checksumAddress('0xFB6916095CA1DF60BB79CE92CE3EA74C37C5D359'), '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359');
  assert.equal(checksumAddress('0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb'), '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB');
  assert.throws(() => checksumAddress('0x1234'));
});

test('every recorded address is checksummed and dated', () => {
  for (const [net, set] of Object.entries(addresses)) {
    for (const [name, entry] of Object.entries(set)) {
      assert.equal(entry.address, checksumAddress(entry.address), `${net}.${name} not checksummed`);
      assert.equal(entry.verifiedOn, '2026-09-12');
      assert.ok(entry.source.length > 0, `${net}.${name} has no source`);
    }
  }
  assert.equal(addresses.mainnet.bootstrapRegistry.address, addresses.testnet.bootstrapRegistry.address);
  assert.ok(!('permit2' in addresses.mainnet), 'Permit2 has no code on 151');
  assert.deepEqual(registryNames, ['permission', 'pricefeed', 'gasfees']);
});

test('chain objects carry the right ids, currency, RPCs and explorers', () => {
  assert.equal(redbellyMainnet.id, 151);
  assert.equal(redbellyTestnet.id, 153);
  for (const c of [redbellyMainnet, redbellyTestnet]) {
    assert.deepEqual(c.nativeCurrency, { name: 'Redbelly Network Coin', symbol: 'RBNT', decimals: 18 });
    assert.equal(c.blockExplorers.default.name, 'Routescan');
    assert.ok(c.rpcUrls.public.http.includes(c.rpcUrls.default.http[0]));
    assert.equal(c.contracts.bootstrapRegistry.address, addresses.mainnet.bootstrapRegistry.address);
    for (const url of c.rpcUrls.public.http) assert.ok(!url.includes('uniblock'), 'keyed endpoint leaked into public list');
  }
  assert.deepEqual(redbellyMainnet.rpcUrls.public.http, ['https://governors.mainnet.redbelly.network', 'https://rpc.ankr.com/redbelly_mainnet']);
  assert.equal(redbellyMainnet.blockExplorers.default.url, 'https://redbelly.routescan.io');
  assert.equal(redbellyTestnet.blockExplorers.default.url, 'https://redbelly.testnet.routescan.io');
  assert.equal(redbellyMainnet.contracts.permission.address, addresses.mainnet.permission.address);
  assert.equal(redbellyTestnet.contracts.permit2.address, addresses.testnet.permit2.address);
  assert.equal(keyedRpcs.mainnet.uniblock.header, 'x-api-key');
  assert.equal(chainById(151), redbellyMainnet);
  assert.equal(chainById(1), undefined);
  assert.equal(redbellyMainnet.testnet, false);
  assert.equal(redbellyTestnet.testnet, true);
});

test('agent notes state the five facts', () => {
  for (const s of ['151', '153', 'isAllowed', 'prague', '0.8.30', 'on demand', 'debug', 'trace']) assert.ok(agentNotes.includes(s), `notes lack ${s}`);
  assert.ok(agentNotes.length < 2000, 'notes should stay short');
  assert.equal(knownAllowed.mainnet.address, checksumAddress(knownAllowed.mainnet.address));
});

test('ABI encoding of address, uint256 and string', () => {
  assert.equal(encodeAddress('0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76'), '000000000000000000000000a2c6a3fc1e12df79b9e3d099faa2ffe860450f76');
  assert.throws(() => encodeAddress('0x12'));
  assert.equal(encodeUint256(1n), '0'.repeat(63) + '1');
  assert.throws(() => encodeUint256(-1n));
  // "permission": offset 0x20, length 10, data padded to 32 bytes
  const enc = encodeString('permission');
  assert.equal(enc.length, 64 * 3);
  assert.equal(enc.slice(0, 64), encodeUint256(32n));
  assert.equal(enc.slice(64, 128), encodeUint256(10n));
  assert.equal(enc.slice(128), Buffer.from('permission').toString('hex').padEnd(64, '0'));
  // 33-byte string spills into a second data word
  assert.equal(encodeString('a'.repeat(33)).length, 64 * 4);
  assert.equal(encodeString('').length, 64 * 2);
  const call = encodeCall(selectors.getContractAddress, enc);
  assert.equal(call.slice(0, 10), '0x04433bbc');
  assert.equal(call.length, 10 + 64 * 3);
});

test('ABI decoding of bool, address and words', () => {
  const one = '0x' + '0'.repeat(63) + '1';
  const zero = '0x' + '0'.repeat(64);
  assert.equal(decodeBool(one), true);
  assert.equal(decodeBool(zero), false);
  assert.throws(() => decodeBool('0x' + '0'.repeat(63) + '2'));
  assert.equal(decodeAddress('0x000000000000000000000000519ba1b48d571fd92faf6fe4d20fe74ca435b690'), '0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690');
  assert.throws(() => decodeAddress('0x1' + '0'.repeat(63)), /high bits/);
  // the three-word getLatestPrice return observed on 2026-09-12
  const ret = '0x' + encodeUint256(2432n) + encodeUint256(1789203590n) + encodeUint256(0n);
  assert.deepEqual(decodeWords(ret), [2432n, 1789203590n, 0n]);
  assert.throws(() => decodeWords('0x123'));
});

test('formatUnits', () => {
  assert.equal(formatUnits(0n, 18), '0');
  assert.equal(formatUnits(1n, 18), '0.000000000000000001');
  assert.equal(formatUnits(4113533525298225000n, 18), '4.113533525298225');
  assert.equal(formatUnits(1500000n, 6), '1.5');
});

// A fake caller that replays the values measured on 2026-09-12.
function fakeRpc(overrides = {}) {
  const permission = addresses.mainnet.permission.address.toLowerCase();
  const pricefeed = addresses.mainnet.pricefeed.address.toLowerCase();
  const registry = addresses.mainnet.bootstrapRegistry.address.toLowerCase();
  const calls = [];
  const caller = async (method, params = []) => {
    calls.push([method, params]);
    if (method === 'eth_chainId') return '0x97';
    if (method === 'eth_getBlockByNumber') return { baseFeePerGas: '0x' + (195882548823725n).toString(16) };
    if (method === 'eth_call') {
      const { to, data } = params[0];
      if (to.toLowerCase() === registry && data.startsWith(selectors.getContractAddress)) {
        const name = Buffer.from(data.slice(10 + 128), 'hex').toString('utf8').replace(/\0+$/, '');
        if (name === 'permission') return '0x' + encodeAddress(permission);
        if (name === 'pricefeed') return '0x' + encodeAddress(pricefeed);
        throw new RpcError('execution reverted', 3, '0x6b8e16c1');
      }
      if (to.toLowerCase() === permission && data.startsWith(selectors.isAllowed)) {
        return '0x' + encodeUint256(data.endsWith(encodeAddress(knownAllowed.mainnet.address)) ? 1n : 0n);
      }
      if (to.toLowerCase() === pricefeed && data === selectors.getLatestPrice) {
        return '0x' + encodeUint256(2432n) + encodeUint256(1789203590n) + encodeUint256(0n);
      }
    }
    throw new Error(`fake rpc: unhandled ${method} ${JSON.stringify(params)}`);
  };
  caller.calls = calls;
  return Object.assign(caller, overrides);
}

test('resolveRegistry decodes and checksums the registry answer', async () => {
  const rpc = fakeRpc();
  assert.equal(await resolveRegistry('permission', { rpc }), addresses.mainnet.permission.address);
  assert.equal(await resolveRegistry('pricefeed', { rpc }), addresses.mainnet.pricefeed.address);
  assert.equal(await resolveRegistry('no-such-name', { rpc }), null, 'a revert means not registered');
});

test('isAllowed encodes the address and decodes the bool', async () => {
  const rpc = fakeRpc();
  assert.equal(await isAllowed(knownAllowed.mainnet.address, { rpc }), true);
  assert.equal(await isAllowed('0x0000000000000000000000000000000000000000', { rpc }), false);
  assert.equal(await isAllowed('0x0000000000000000000000000000000000000000', { rpc, permission: addresses.mainnet.permission.address }), false);
  const direct = rpc.calls.filter(([m]) => m === 'eth_call');
  assert.equal(direct.at(-1)[1][0].data, selectors.isAllowed + '0'.repeat(64));
});

test('getLatestPrice scales by six decimals', async () => {
  const p = await getLatestPrice({ rpc: fakeRpc() });
  assert.equal(p.usdPerRbnt, 0.002432);
  assert.equal(p.raw, 2432n);
  assert.equal(p.timestamp, 1789203590);
  assert.equal(p.decimals, 6);
  assert.equal(PRICE_FEED_DECIMALS, 6);
  assert.equal(p.priceFeed, addresses.mainnet.pricefeed.address);
});

test('gasCostUsd reproduces the US$0.01 transfer at the measured base fee and price', async () => {
  const c = await gasCostUsd({ gasUsed: 21_000, rpc: fakeRpc() });
  assert.equal(c.gasPriceWei, 195882548823725n);
  assert.equal(c.wei, 21_000n * 195882548823725n);
  assert.equal(c.rbnt, '4.113533525298225');
  // 4.1135 RBNT * 0.002432 USD = 0.010004 USD
  assert.ok(Math.abs(c.usd - 0.010004) < 0.000001, `usd was ${c.usd}`);
  const explicit = await gasCostUsd({ gasUsed: 1n, gasPriceWei: 10n ** 18n, rpc: fakeRpc() });
  assert.equal(explicit.usd, 0.002432);
  assert.equal(explicit.rbnt, '1');
});
