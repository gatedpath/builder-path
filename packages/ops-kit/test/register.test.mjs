// The register reader against a scripted chain: a function answering eth_getCode and eth_call for a
// small T-REX model. No network, no Foundry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { functionSelector } from '@gatedpath/chains';
import { readRegister, isErc3643, describeRegister, decodeString, decodeWordArray, NotARegister, SELECTORS } from '../src/register.mjs';

const A = (n) => '0x' + n.toString(16).padStart(40, '0');
const word = (v) => BigInt(v).toString(16).padStart(64, '0');
const addrWord = (a) => word(BigInt(a));
const encString = (s) => { const b = Buffer.from(s, 'utf8'); return '0x' + word(32) + word(b.length) + b.toString('hex').padEnd(Math.ceil(b.length / 32) * 64, '0'); };
const encArray = (items) => '0x' + word(32) + word(items.length) + items.map((i) => word(BigInt(i))).join('');
const TOKEN = A(0xaa), REGISTRY = A(0xbb), STORAGE = A(0xcc), ISSUERS = A(0xdd), TOPICS = A(0xee), ONCHAINID = A(0x11), COMPLIANCE = A(0x22);
const ISSUER1 = A(0x101), ISSUER2 = A(0x102);
const HOLDER = A(0x501), STRANGER = A(0x502), FROZEN = A(0x503), IDENT = A(0x601);
const PLAIN = A(0xf0); // an ERC-20 that is not a register

function model() {
  return {
    code: { [TOKEN]: '0x60aa', [REGISTRY]: '0x60bb', [PLAIN]: '0x60f0' },
    topics: [1n, 2n],
    issuers: { [ISSUER1]: [1n, 2n], [ISSUER2]: [2n] },
    paused: true,
    verified: { [HOLDER]: true, [FROZEN]: true },
    identity: { [HOLDER]: IDENT, [FROZEN]: IDENT },
    country: { [HOLDER]: 36 },
    frozen: { [FROZEN]: true },
    frozenTokens: { [FROZEN]: 5n },
    balance: { [HOLDER]: 100n, [FROZEN]: 7n },
    calls: 0,
  };
}
const sel = (sig) => functionSelector(sig);

function fakeRpc(m) {
  return async (method, params = []) => {
    m.calls += 1;
    if (method === 'eth_getCode') return m.code[params[0].toLowerCase()] ?? '0x';
    if (method !== 'eth_call') throw new Error(`unexpected ${method}`);
    const to = params[0].to.toLowerCase();
    const data = params[0].data;
    const s = data.slice(0, 10);
    const arg = data.length >= 74 ? '0x' + data.slice(34, 74) : null;
    const revert = () => { throw Object.assign(new Error('execution reverted'), { code: 3 }); };
    if (to === PLAIN) {
      if (s === sel('name()')) return encString('Plain');
      revert();
    }
    if (to === TOKEN) {
      switch (s) {
        case sel('identityRegistry()'): return '0x' + addrWord(REGISTRY);
        case sel('name()'): return encString('CLASS A');
        case sel('symbol()'): return encString('A');
        case sel('decimals()'): return '0x' + word(18);
        case sel('totalSupply()'): return '0x' + word(1000n);
        case sel('version()'): return encString('4.1.3');
        case sel('paused()'): return '0x' + word(m.paused ? 1 : 0);
        case sel('onchainID()'): return '0x' + addrWord(ONCHAINID);
        case sel('compliance()'): return '0x' + addrWord(COMPLIANCE);
        case sel('isFrozen(address)'): return '0x' + word(m.frozen[arg] ? 1 : 0);
        case sel('getFrozenTokens(address)'): return '0x' + word(m.frozenTokens[arg] ?? 0n);
        case sel('balanceOf(address)'): return '0x' + word(m.balance[arg] ?? 0n);
      }
      revert();
    }
    if (to === REGISTRY) {
      switch (s) {
        case sel('identityStorage()'): return '0x' + addrWord(STORAGE);
        case sel('issuersRegistry()'): return '0x' + addrWord(ISSUERS);
        case sel('topicsRegistry()'): return '0x' + addrWord(TOPICS);
        case sel('isVerified(address)'): return '0x' + word(m.verified[arg] ? 1 : 0);
        case sel('identity(address)'): return '0x' + addrWord(m.identity[arg] ?? A(0));
        case sel('investorCountry(address)'): return '0x' + word(m.country[arg] ?? 0);
        case sel('contains(address)'): return '0x' + word(m.identity[arg] ? 1 : 0);
      }
      revert();
    }
    if (to === ISSUERS) {
      if (s === sel('getTrustedIssuers()')) return encArray(Object.keys(m.issuers));
      if (s === sel('getTrustedIssuerClaimTopics(address)')) return encArray(m.issuers[arg] ?? []);
      revert();
    }
    if (to === TOPICS) {
      if (s === sel('getClaimTopics()')) return encArray(m.topics);
      revert();
    }
    throw new Error(`unexpected eth_call to ${to}`);
  };
}

test('selectors are derived from the signatures', () => {
  assert.equal(SELECTORS.identityRegistry, '0x134e18f4');
  assert.equal(SELECTORS.isVerified, functionSelector('isVerified(address)'));
});

test('decodeString and decodeWordArray read ABI return data', () => {
  assert.equal(decodeString(encString('CLASS A')), 'CLASS A');
  assert.equal(decodeString('0x'), '');
  assert.deepEqual(decodeWordArray(encArray([7n, 9n])), [7n, 9n]);
  assert.deepEqual(decodeWordArray(encArray([])), []);
});

test('a T-REX token is a register and a plain ERC-20 is not', async () => {
  const m = model();
  assert.equal(await isErc3643({ rpc: fakeRpc(m), address: TOKEN }), true);
  assert.equal(await isErc3643({ rpc: fakeRpc(m), address: PLAIN }), false);
  assert.equal(await isErc3643({ rpc: fakeRpc(m), address: A(0x7777) }), false, 'no code at all');
  await assert.rejects(readRegister({ rpc: fakeRpc(m), token: PLAIN }), NotARegister);
});

test('a full read: token, registry, trusted issuers with their topics, required topics, the claims gate', async () => {
  const m = model();
  const r = await readRegister({ rpc: fakeRpc(m), token: TOKEN });
  assert.equal(r.token.name, 'CLASS A');
  assert.equal(r.token.symbol, 'A');
  assert.equal(r.token.decimals, 18);
  assert.equal(r.token.totalSupply, 1000n);
  assert.equal(r.token.version, '4.1.3');
  assert.equal(r.token.paused, true);
  assert.equal(r.token.onchainID.toLowerCase(), ONCHAINID);
  assert.equal(r.token.compliance.toLowerCase(), COMPLIANCE);
  assert.equal(r.registry.address.toLowerCase(), REGISTRY);
  assert.equal(r.registry.identityStorage.toLowerCase(), STORAGE);
  assert.deepEqual(r.registry.claimTopics, [1n, 2n]);
  assert.equal(r.registry.trustedIssuers.length, 2);
  assert.deepEqual(r.registry.trustedIssuers.map((i) => i.address.toLowerCase()), [ISSUER1, ISSUER2]);
  assert.deepEqual(r.registry.trustedIssuers[1].claimTopics, [2n]);
  assert.equal(r.registry.gate, 'claims');
  assert.equal(r.wallet, null);
});

test('a register with no required topics is gated by registration only', async () => {
  const m = model();
  m.topics = [];
  m.issuers = {};
  const r = await readRegister({ rpc: fakeRpc(m), token: TOKEN });
  assert.equal(r.registry.gate, 'registration only');
  assert.equal(r.registry.trustedIssuers.length, 0);
  assert.match(describeRegister(r).join('\n'), /registration only/);
});

test('where a wallet stands: verified holder, stranger, frozen holder', async () => {
  const m = model();
  const holder = (await readRegister({ rpc: fakeRpc(m), token: TOKEN, wallet: HOLDER })).wallet;
  assert.equal(holder.isVerified, true);
  assert.equal(holder.registered, true);
  assert.equal(holder.identity.toLowerCase(), IDENT);
  assert.equal(holder.country, 36);
  assert.equal(holder.frozen, false);
  assert.equal(holder.balance, 100n);

  const stranger = (await readRegister({ rpc: fakeRpc(m), token: TOKEN, wallet: STRANGER })).wallet;
  assert.equal(stranger.isVerified, false);
  assert.equal(stranger.registered, false);
  assert.equal(stranger.identity, null);
  assert.equal(stranger.country, null);
  assert.equal(stranger.balance, 0n);

  const frozen = (await readRegister({ rpc: fakeRpc(m), token: TOKEN, wallet: FROZEN })).wallet;
  assert.equal(frozen.frozen, true);
  assert.equal(frozen.frozenTokens, 5n);
  assert.match(describeRegister({ ...(await readRegister({ rpc: fakeRpc(m), token: TOKEN, wallet: FROZEN })) }).join('\n'), /FROZEN/);
});

test('a function the deployed version lacks reads as null, not as a failed read', async () => {
  const m = model();
  const rpc = fakeRpc(m);
  const patched = async (method, params) => {
    if (method === 'eth_call' && params[0].to.toLowerCase() === TOKEN && params[0].data.startsWith(sel('version()'))) {
      throw Object.assign(new Error('execution reverted'), { code: 3 });
    }
    return rpc(method, params);
  };
  const r = await readRegister({ rpc: patched, token: TOKEN });
  assert.equal(r.token.version, null);
  assert.equal(r.token.name, 'CLASS A');
});

test('the description is one fact a line and says what it does not know', async () => {
  const m = model();
  const lines = describeRegister(await readRegister({ rpc: fakeRpc(m), token: TOKEN, wallet: HOLDER }));
  assert.match(lines[0], /CLASS A \(A\), an ERC-3643 register, T-REX 4\.1\.3/);
  assert.match(lines[1], /PAUSED by the issuer/);
  assert.match(lines[2], /2 trusted issuer\(s\); 2 required claim topic\(s\)/);
  assert.match(lines[4], /VERIFIED for this register/);
  assert.match(lines.at(-1), /does not say who holds the identity/);
});
