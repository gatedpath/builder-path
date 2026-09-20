// explain_failure: the pure paths over inputs captured from real runs, then the transaction-hash
// path end to end on a local anvil: receptor-mock's GatedCounter behind a ReceptorMock, a wallet
// seeded Expired, its increment() mined with status 0, and the tool replaying the call, decoding
// NotEligible and reading the verifier's eligibilityStatus. Nothing signs against a real network;
// the anvil accounts used are 7 and 8, never 0 or 1.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { encodeAddress, encodeCall, encodeUint256, functionSelector } from '@gatedpath/chains';
import { failures, NOT_ELIGIBLE_SELECTOR, ZERO_VERIFIER_SELECTOR, ERROR_STRING_SELECTOR, PANIC_SELECTOR } from '@gatedpath/agent-rules';
import { DOCS_MAP, lookupDocs, revertHexIn, MEASURED_DEPLOY_GAS } from '../dist/index.js';
import { installRedbellyMocks, startAnvil } from '../../preflight/test/anvil.mjs';
import { connect, parse } from './client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const receptorMock = join(here, '..', '..', 'receptor-mock');
const hasForge = spawnSync('forge', ['--version']).status === 0;

// Captured on 14 September 2026 (golden-path-dev-2026-09-14.md step 6, card-01.md, and cast/forge/anvil 1.7.1 probes).
const REAL = {
  notEligibleCast: 'Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted: custom error 0x879342fb: 0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012, data: "0x879342fb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012": NotEligible(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 18)',
  notEligibleData: '0x879342fb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012',
  balance: 'fail  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 380.5286 RBNT but 3,000,000 gas needs 768.3796 RBNT with 25% margin (US$1.4286 at the feed price); get testnet RBNT at https://redbelly.faucetme.pro/.',
  keystore: 'Error: Keystore file `"/home/builder/.foundry/keystores/deployer"` does not exist',
  password: 'Error: Failed to decrypt keystore "/home/builder/.foundry/keystores/deployer"\n\nContext:\n- Mac Mismatch',
  port: 'Error: Address already in use (os error 98)',
  funds: 'Error: server returned an error response: error code -32003: Insufficient funds for gas * price + value',
  forgeStd: 'Unable to resolve imports:\n      "forge-std/Script.sol" in "/tmp/p/script/D.s.sol"\nwith remappings:\n\nCompiling 1 files with Solc 0.8.30\nError: Compiler run failed:\nError (6275): Source "forge-std/Script.sol" not found: File not found.',
};

describe('explain_failure, pure paths', () => {
  let c;
  before(async () => {
    c = await connect();
  });
  after(async () => c.close());

  test('the selectors in the table are the keccak of their signatures', () => {
    assert.equal(functionSelector('NotEligible(address,uint64)'), NOT_ELIGIBLE_SELECTOR);
    assert.equal(functionSelector('ZeroVerifier()'), ZERO_VERIFIER_SELECTOR);
    assert.equal(functionSelector('Error(string)'), ERROR_STRING_SELECTOR);
    assert.equal(functionSelector('Panic(uint256)'), PANIC_SELECTOR);
  });

  test('every docs topic in the table resolves through docs_lookup, so the site topics and the table cannot drift', () => {
    const topics = new Set(DOCS_MAP.flatMap((e) => [e.topic, ...(e.aliases ?? [])]));
    let withTopic = 0;
    for (const f of failures) {
      if (!f.topic) continue;
      withTopic++;
      assert.ok(topics.has(f.topic), `${f.kind}: topic ${f.topic} is not in DOCS_MAP`);
      const hit = lookupDocs(f.topic);
      assert.ok(hit, f.kind);
      assert.match(hit.url, /redbelly/);
    }
    assert.ok(withTopic >= 20);
  });

  test('exactly one input, and txHash needs chain', async () => {
    for (const args of [{}, { revert: '0x', stderr: 'x' }, { txHash: '0x' + '12'.repeat(32) }]) {
      const r = await c.call('explain_failure', args);
      assert.equal(r.isError, true, JSON.stringify(args));
    }
  });

  test('the NotEligible revert from the wave 6 transcript, as hex and as the cast message', async () => {
    for (const revert of [REAL.notEligibleData, REAL.notEligibleCast]) {
      const r = parse(await c.call('explain_failure', { revert }));
      assert.equal(r.kind, 'not-eligible');
      assert.deepEqual(r.decoded, { selector: '0x879342fb', error: 'NotEligible(address,uint64)', wallet: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', requestId: '18' });
      assert.equal(r.eligibilityStatus, null);
      assert.match(r.plainWords, /^The contract refused this wallet/);
      assert.match(r.cause, /isEligible/);
      assert.match(r.fix.command, /eligibilityStatus/);
      assert.match(r.fix.link, /docs\.redbelly\.network/);
      assert.equal(r.input, 'revert');
      assert.equal(r.readOnly, true);
    }
    const asStderr = parse(await c.call('explain_failure', { stderr: REAL.notEligibleCast }));
    assert.equal(asStderr.kind, 'not-eligible');
    assert.equal(revertHexIn(REAL.notEligibleCast), REAL.notEligibleData);
  });

  test('the pre-flight balance failure, with the measured figures in the words', async () => {
    const r = parse(await c.call('explain_failure', { stderr: REAL.balance }));
    assert.equal(r.kind, 'preflight-balance');
    assert.match(r.preflightLine, /^0xA2c6/);
    assert.match(r.cause, /1,899,210/);
    assert.match(r.cause, /768\.4 RBNT/);
    assert.match(r.fix.command, /--gas 1899210/);
    assert.equal(r.fix.link, 'https://redbelly.faucetme.pro/');
    assert.equal(r.pricing, undefined, 'no rpc, no network call');
    assert.equal(MEASURED_DEPLOY_GAS, 1_899_210);
  });

  test('Error(string) data from the deploy script and the other real texts', async () => {
    const reason = 'ADMIN_SAFE threshold must be at least 2';
    const hex = Buffer.from(reason).toString('hex').padEnd(64, '0');
    const data = `${ERROR_STRING_SELECTOR}${'20'.padStart(64, '0')}${reason.length.toString(16).padStart(64, '0')}${hex}`;
    const r = parse(await c.call('explain_failure', { revert: data }));
    assert.equal(r.kind, 'deploy-threshold-below-2');
    assert.equal(r.decoded.reason, reason);
    const expected = [
      [REAL.keystore, 'keystore-not-found'],
      [REAL.password, 'keystore-wrong-password'],
      [REAL.port, 'port-in-use'],
      [REAL.funds, 'insufficient-funds'],
      [REAL.forgeStd, 'forge-std-missing'],
      ['Refused: argument passwordFile looks like a secret (the whole value is 64 hex characters)', 'secret-in-argument'],
    ];
    for (const [stderr, kind] of expected) {
      const e = parse(await c.call('explain_failure', { stderr }));
      assert.equal(e.kind, kind, stderr.slice(0, 40));
      assert.ok(e.fix.command || e.fix.link, kind);
    }
  });

  test('unknown input comes back as kind unknown with the raw text, never a guess', async () => {
    const r = parse(await c.call('explain_failure', { stderr: 'Segmentation fault (core dumped)' }));
    assert.equal(r.kind, 'unknown');
    assert.equal(r.raw, 'Segmentation fault (core dumped)');
    assert.deepEqual(r.fix, {});
    const sel = parse(await c.call('explain_failure', { revert: '0xdeadbeef' + '00'.repeat(32) }));
    assert.equal(sel.kind, 'unknown');
    assert.equal(sel.decoded.selector, '0xdeadbeef');
    const panic = parse(await c.call('explain_failure', { revert: PANIC_SELECTOR + '11'.padStart(64, '0') }));
    assert.equal(panic.kind, 'unknown');
    assert.equal(panic.decoded.panic, 17);
  });

  test('a key-shaped stderr is still refused; a transaction hash is not a key', async () => {
    const r = await c.call('explain_failure', { stderr: `PRIVATE_KEY=${'ab'.repeat(32)}` });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /looks like a secret/);
    const mnemonic = await c.call('explain_failure', { revert: 'abandon ability able about above absent absorb abstract absurd abuse access accident' });
    assert.equal(mnemonic.isError, true);
    const bare = await c.call('explain_failure', { revert: 'ab'.repeat(32) });
    assert.equal(bare.isError, true, 'a bare 64-hex value in revert is refused');
    const hash = await c.call('explain_failure', { txHash: '0x' + 'ab'.repeat(32), chain: 153, rpc: 'http://127.0.0.1:1/' });
    assert.equal(hash.isError ?? false, false, 'txHash passes the guard');
    const body = parse(hash);
    assert.equal(body.kind, 'unknown');
    assert.match(body.error, /could not read the receipt/);
  });
});

describe('explain_failure with a transaction hash on a local chain 153', { skip: hasForge ? false : 'forge is not installed' }, () => {
  let c, anvil, counter, verifier, wallet, deployer;
  const artifact = (file, name) => JSON.parse(readFileSync(join(receptorMock, 'out', file, `${name}.json`), 'utf8'));
  const send = async (from, tx) => {
    const hash = await anvil.rpc('eth_sendTransaction', [{ from, ...tx }]);
    for (let i = 0; i < 50; i++) {
      const receipt = await anvil.rpc('eth_getTransactionReceipt', [hash]);
      if (receipt) return { hash, receipt };
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('no receipt');
  };
  before(async () => {
    c = await connect();
    anvil = await startAnvil(153);
    await installRedbellyMocks(anvil);
    if (!existsSync(join(receptorMock, 'out', 'GatedCounter.sol', 'GatedCounter.json'))) {
      const b = spawnSync('forge', ['build'], { cwd: receptorMock, encoding: 'utf8' });
      assert.equal(b.status, 0, b.stderr);
    }
    deployer = anvil.accounts[7];
    wallet = anvil.accounts[8];
    const mock = await send(deployer, { data: artifact('ReceptorMock.sol', 'ReceptorMock').bytecode.object, gas: '0x2dc6c0' });
    verifier = mock.receipt.contractAddress;
    // encodeAddress and encodeUint256 return bare 64-hex words
    const gc = await send(deployer, { data: artifact('GatedCounter.sol', 'GatedCounter').bytecode.object + encodeAddress(verifier) + encodeUint256(18n), gas: '0x2dc6c0' });
    counter = gc.receipt.contractAddress;
    // Anyone can set a state on the mock: wallet 8 becomes Expired (2) for request 18.
    await send(deployer, { to: verifier, data: encodeCall(functionSelector('setStatus(address,uint64,uint8)'), encodeAddress(wallet), encodeUint256(18n), encodeUint256(2n)), gas: '0x30d40' });
  });
  after(async () => {
    await c.close();
    await anvil.stop();
  });

  test('a mined NotEligible revert is replayed, decoded, and the verifier names the state', async () => {
    const tx = await send(wallet, { to: counter, data: functionSelector('increment()'), gas: '0x186a0' });
    assert.equal(Number(BigInt(tx.receipt.status)), 0, 'the transaction mined with status 0');
    const r = parse(await c.call('explain_failure', { txHash: tx.hash, chain: 153, rpc: anvil.url }));
    assert.equal(r.kind, 'not-eligible-expired');
    assert.match(r.plainWords, /past its validity window/);
    assert.equal(r.eligibilityStatus.name, 'Expired');
    assert.equal(r.eligibilityStatus.verifier.toLowerCase(), verifier.toLowerCase());
    assert.equal(r.decoded.wallet, wallet.toLowerCase());
    assert.equal(r.decoded.requestId, '18');
    assert.equal(r.receipt.status, 0);
    assert.match(r.revertData, new RegExp(`^${NOT_ELIGIBLE_SELECTOR}`));
    assert.equal(r.input, 'txHash');
    // flip the state and the same hash reads NeverIssued at that block? No: the read is at the failing block, so it stays Expired.
    await send(deployer, { to: verifier, data: encodeCall(functionSelector('setStatus(address,uint64,uint8)'), encodeAddress(wallet), encodeUint256(18n), encodeUint256(0n)), gas: '0x30d40' });
    const again = parse(await c.call('explain_failure', { txHash: tx.hash, chain: 153, rpc: anvil.url }));
    assert.equal(again.kind, 'not-eligible-expired', 'the state is read at the block the transaction failed in');
  });

  test('a successful transaction and an unknown hash are not dressed up', async () => {
    await send(deployer, { to: verifier, data: encodeCall(functionSelector('setStatus(address,uint64,uint8)'), encodeAddress(wallet), encodeUint256(18n), encodeUint256(1n)), gas: '0x30d40' });
    const tx = await send(wallet, { to: counter, data: functionSelector('increment()'), gas: '0x186a0' });
    assert.equal(Number(BigInt(tx.receipt.status)), 1);
    const r = parse(await c.call('explain_failure', { txHash: tx.hash, chain: 153, rpc: anvil.url }));
    assert.equal(r.kind, 'unknown');
    assert.equal(r.receipt.status, 1);
    assert.match(r.note, /succeeded/);
    const none = parse(await c.call('explain_failure', { txHash: '0x' + 'cd'.repeat(32), chain: 153, rpc: anvil.url }));
    assert.equal(none.kind, 'unknown');
    assert.equal(none.receipt, null);
    assert.match(none.note, /never mined/);
  });

  test('with an rpc, an RBNT failure carries the current price through gasCostUsd', async () => {
    const r = parse(await c.call('explain_failure', { stderr: REAL.balance, chain: 153, rpc: anvil.url }));
    assert.equal(r.kind, 'preflight-balance');
    assert.equal(r.pricing.usdPerRbnt, 0.002431);
    assert.equal(r.pricing.measuredDeployGas, 1_899_210);
    assert.ok(r.pricing.measuredDeployUsd > 0);
    assert.match(r.pricing.measuredDeployRbnt, /^\d+(\.\d+)?$/);
    const geth = parse(await c.call('explain_failure', { stderr: 'insufficient funds for gas * price + value: balance 1000000000000000000, tx cost 3000000000000000000, overshot 2000000000000000000', rpc: anvil.url }));
    assert.equal(geth.kind, 'insufficient-funds');
    assert.equal(geth.pricing.shortfall.rbnt, '2');
  });
});
