// The failure table: one entry per kind, every kind on a site page, every network link on Vine or
// docs.redbelly.network, house style, and the pure decoders against revert data and stderr captured
// from real runs (the wave 6 transcript of 14 September 2026 and cast/forge/anvil 1.7.1 the same day).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  failures, FAILURE_KINDS, failureByKind, notEligibleEntry, decodeRevertData, matchText, matchErrorName,
  ELIGIBILITY_STATUS_NAMES, NOT_ELIGIBLE_SELECTOR, ERROR_STRING_SELECTOR, chainFacts,
} from '../dist/esm/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const siteDocs = resolve(here, '..', '..', '..', 'site', 'src', 'content', 'docs');

const REQUIRED = [
  'not-eligible', 'not-eligible-never-issued', 'not-eligible-expired', 'not-eligible-revoked', 'not-eligible-wrong-jurisdiction',
  'deploy-mainnet-no-safe', 'deploy-threshold-below-2', 'deploy-deployer-not-allowed', 'deploy-mainnet-no-verifier', 'deploy-no-ship-report',
  'preflight-chain-id', 'preflight-deployer-verified', 'preflight-admin-safe', 'preflight-compiler-pins', 'preflight-git-secrets', 'preflight-balance', 'preflight-slither-report',
  'wallet-not-allowed', 'node-rejects-unverified-wallet',
  'keystore-not-found', 'keystore-wrong-password', 'chain-mismatch', 'insufficient-funds', 'forge-std-missing', 'anvil-not-found', 'port-in-use',
  // wave 8: what redbelly-doctor reports
  'node-too-old', 'foundry-exit-code-shim', 'foundry-version-mismatch', 'git-not-found', 'env-tracked', 'vendor-drift', 'aderyn-not-found',
];

test('every kind the plan names is in the table, once, in kebab-case', () => {
  for (const k of REQUIRED) assert.ok(FAILURE_KINDS.includes(k), `missing ${k}`);
  assert.equal(new Set(FAILURE_KINDS).size, FAILURE_KINDS.length);
  for (const k of FAILURE_KINDS) assert.match(k, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(failures.length >= 35);
});

test('every kind has a docs page in the site content, and the page exists', () => {
  for (const f of failures) {
    assert.match(f.docsPage, /^\/[a-z-]+(\/[a-z-]+)?\/$/, `${f.kind}: docsPage must be a site path`);
    const rel = f.docsPage.slice(1, -1);
    const candidates = [`${rel}.mdx`, `${rel}.md`, `${rel}/index.mdx`];
    assert.ok(candidates.some((c) => existsSync(resolve(siteDocs, c))), `${f.kind}: no site page for ${f.docsPage}`);
  }
  const errorsPage = readFileSync(resolve(siteDocs, 'errors.mdx'), 'utf8');
  assert.match(errorsPage, /FailureTable/, 'the /errors page renders the table from this package');
});

test('every entry says what, why and the next step, and every network link stays on Redbelly hosts', () => {
  const allowedHosts = /^https:\/\/(vine\.redbelly\.network|docs\.redbelly\.network|access\.redbelly\.network|redbelly\.faucetme\.pro|getfoundry\.sh|github\.com\/crytic|github\.com\/Cyfrin|nodejs\.org|git-scm\.com)(\/|$)/;
  for (const f of failures) {
    assert.ok(f.title.length > 3 && f.plainWords.length > 20 && f.cause.length > 20, f.kind);
    assert.ok(f.fix.command || f.fix.link, `${f.kind} has no fix`);
    if (f.fix.link) assert.match(f.fix.link, allowedHosts, `${f.kind} links off the allow-list: ${f.fix.link}`);
    if (f.topic && f.fix.link) assert.match(f.fix.link, /redbelly/, `${f.kind}: a network fact (one with a docs_lookup topic) links to Redbelly's own pages`);
    assert.ok(['measured', 'reported', 'pending'].includes(f.status));
    assert.ok(f.measured.length > 10, `${f.kind} says where it was measured or what is pending`);
    if (f.status === 'pending') assert.match(f.measured, /not yet|pending/i);
  }
  assert.deepEqual(failures.filter((f) => f.status === 'pending').map((f) => f.kind), []);
  // `reported`: someone else saw it and said where; we have not. It must say so, name them and link.
  for (const f of failures.filter((x) => x.status === 'reported')) {
    assert.match(f.measured, /not captured by us|not seen by us/i, `${f.kind} must say we have not seen it ourselves`);
    assert.ok(f.reportedBy && /^https:\/\//.test(f.reportedBy.url) && /^\d{4}-\d{2}-\d{2}$/.test(f.reportedBy.date) && f.reportedBy.who.length > 2, `${f.kind} credits its source`);
  }
  assert.deepEqual(failures.filter((f) => f.status === 'reported').map((f) => f.kind), ['node-rejects-unverified-wallet']);
});

// 19 September 2026. The one error we could not capture, because a fork does not enforce the node's
// permission map and no wallet of ours has signed on the real network. A DAO developer published
// the string with a testnet transaction as evidence; recognise it, and say whose observation it is.
test('the node\'s refusal of an unverified wallet is recognised from the string a third party reported', () => {
  for (const line of [
    'ProviderError: Sender not authorised to write transactions',
    'Error: server returned an error response: error code -32000: sender not authorised to write transactions',
    'sender not authorized to write transactions',
  ]) {
    assert.equal(matchText(line)?.kind, 'node-rejects-unverified-wallet', line);
  }
});

test('house style: contractions allowed, no em dash, no exclamation mark, no marketing vocabulary, no bold-term list', () => {
  const marketing = /\b(delve|leverage|robust|seamless|comprehensive|cutting-edge|groundbreaking|transformative|game-changing|innovative|harness|foster|bolster|underscore|unpack|pivotal|holistic|multifaceted|vibrant|landscape|realm)\b/i;
  for (const f of failures) {
    const text = [f.title, f.plainWords, f.cause, f.fix.command ?? '', f.measured].join('\n');
    assert.ok(!text.includes('—'), `${f.kind} has an em dash`);
    assert.ok(!/!/.test(text), `${f.kind} has an exclamation mark`);
    assert.ok(!marketing.test(text), `${f.kind}: ${text.match(marketing)?.[0]}`);
    assert.ok(!/\*\*[^*]+\*\*:/.test(text), `${f.kind} has a bold-term list`);
  }
});

test('addresses and RPC URLs in commands come from the chain-facts snapshot', () => {
  const text = failures.map((f) => f.fix.command ?? '').join('\n');
  const found = text.match(/0x[0-9a-fA-F]{40}/g) ?? [];
  const canonical = new Set([chainFacts.testnet.addresses.permission.address, chainFacts.mainnet.addresses.bootstrapRegistry.address]);
  assert.ok(found.length >= 2);
  for (const a of found) assert.ok(canonical.has(a), `${a} is not from chain-facts`);
  for (const url of text.match(/https:\/\/governors[^\s]+/g) ?? []) assert.ok([chainFacts.testnet.rpc, chainFacts.mainnet.rpc].includes(url), url);
  assert.ok(!/0x[0-9a-fA-F]{64}/.test(JSON.stringify(failures)), 'no key-shaped value anywhere in the table');
});

test('decodeRevertData: NotEligible from the wave 6 transcript, Error(string), Panic, unknown', () => {
  // The exact data cast printed on 14 September 2026 for wallet 2 (Anvil account 2) and request id 18.
  const data = '0x879342fb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012';
  const d = decodeRevertData(data);
  assert.equal(d.selector, NOT_ELIGIBLE_SELECTOR);
  assert.equal(d.kind, 'not-eligible');
  assert.deepEqual(d.notEligible, { wallet: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', requestId: '18' });
  // Error("ADMIN_SAFE is not set"), encoded by hand: selector, offset 32, length 21, the bytes padded.
  const reason = 'ADMIN_SAFE is not set';
  const hex = Buffer.from(reason).toString('hex').padEnd(64, '0');
  const err = decodeRevertData(`${ERROR_STRING_SELECTOR}${'20'.padStart(64, '0')}${reason.length.toString(16).padStart(64, '0')}${hex}`);
  assert.equal(err.reason, reason);
  assert.equal(err.kind, 'deploy-mainnet-no-safe');
  const panic = decodeRevertData('0x4e487b71' + '11'.padStart(64, '0'));
  assert.equal(panic.panic, 0x11);
  assert.equal(panic.kind, null);
  const unknown = decodeRevertData('0xdeadbeef');
  assert.deepEqual(unknown, { selector: '0xdeadbeef', kind: null });
  assert.equal(decodeRevertData('not hex'), null);
  assert.equal(decodeRevertData('0x12'), null);
  assert.equal(decodeRevertData('0x879342fb').kind, 'not-eligible', 'a bare selector still names the kind');
});

test('notEligibleEntry picks the entry for each credential state', () => {
  assert.deepEqual([...ELIGIBILITY_STATUS_NAMES], ['NeverIssued', 'Valid', 'Expired', 'Revoked', 'WrongJurisdiction']);
  assert.equal(notEligibleEntry(0).kind, 'not-eligible-never-issued');
  assert.equal(notEligibleEntry('Expired').kind, 'not-eligible-expired');
  assert.equal(notEligibleEntry(3).kind, 'not-eligible-revoked');
  assert.equal(notEligibleEntry('WrongJurisdiction').kind, 'not-eligible-wrong-jurisdiction');
  assert.equal(notEligibleEntry(1).kind, 'not-eligible', 'Valid on read after a revert falls back to the plain entry');
  assert.equal(notEligibleEntry(null).kind, 'not-eligible');
  assert.equal(notEligibleEntry(undefined).kind, 'not-eligible');
});

test('matchText recognises the lines real tools printed', () => {
  const cases = [
    ['fail  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 380.5286 RBNT but 3,000,000 gas needs 768.3796 RBNT with 25% margin (US$1.4286 at the feed price); get testnet RBNT at https://redbelly.faucetme.pro/.', 'preflight-balance'],
    ['pass  chain-id  ok\nfail  git-secrets        1 secret-shaped addition in 1 commits, first in contracts/reports/slither.sources.sha256 at 0123456789 (a bare 64-hex value, the shape of a private key in a .env or keystore export); rotate the key, then', 'preflight-git-secrets'],
    ['{"checks":[{"id":"deployer-verified","status":"fail","reason":"x"}]}', 'preflight-deployer-verified'],
    ['Error: Keystore file `"/home/me/.foundry/keystores/nosuch"` does not exist', 'keystore-not-found'],
    ['Error: Failed to decrypt keystore "/home/me/.foundry/keystores/probe"\n\nContext:\n- Mac Mismatch', 'keystore-wrong-password'],
    ['Error: Keystore password file `"/x/nope"` does not exist', 'password-file-not-found'],
    ['Error: Address already in use (os error 98)', 'port-in-use'],
    ['Error: server returned an error response: error code -32003: Insufficient funds for gas * price + value', 'insufficient-funds'],
    ['Error: error sending request for url (http://127.0.0.1:1/)', 'rpc-unreachable'],
    ['Error: Compiler run failed:\nError (6275): Source "forge-std/Script.sol" not found: File not found.', 'forge-std-missing'],
    ['Error: Compiler run failed:\nError (9574): Type literal_string "a" is not implicitly convertible to expected type uint256.', 'compile-error'],
    ['Error: version not found in artifacts for this platform: 0.8.99', 'solc-version-missing'],
    ['spawn anvil ENOENT', 'anvil-not-found'],
    ['[dev] forge and anvil not found on PATH; forge and anvil are needed.', 'anvil-not-found'],
    ['[dev] npm run dev is already running (pid 12, since now, Anvil on port 8545).', 'dev-already-running'],
    ['Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted: custom error 0x879342fb: ..., data: "0x879342fb...": NotEligible(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 18)', 'not-eligible'],
    ['revert: deployer fails permission.isAllowed', 'deploy-deployer-not-allowed'],
    ['Error: script failed: revert: no ship report dated today for chain 151: run redbelly ship first', 'deploy-no-ship-report'],
    ['Refused: argument passwordFile looks like a secret (the whole value is 64 hex characters)', 'secret-in-argument'],
    ['that argument looks like a private key; pre-flight never takes one', 'secret-in-argument'],
    ['refused: this RPC reports chain 151 (mainnet). deploy_testnet never deploys to mainnet.', 'chain-mismatch'],
    ['slither wrote no report; is slither 0.11.6 installed (pip install slither-analyzer==0.11.6)?', 'slither-not-found'],
    // redbelly-doctor lines, 14 September 2026: the same `fail  <id>` shape as pre-flight, matched by the doctor id
    ['pass  node               v22.22.2 (22 or later)\nfail  foundry-exit-code  forge at /usr/local/bin/forge is the @foundry-rs npm shim', 'foundry-exit-code-shim'],
    ['fail  node               v20.19.0 is older than 22', 'node-too-old'],
    ['fail  forge              not found on PATH', 'forge-not-found'],
    ['fail  cast               not found on PATH', 'forge-not-found'],
    ['fail  env-tracked        .env is tracked', 'env-tracked'],
    ['fail  vendor             vendor/redbelly-chains is 0.0.9, the record says 0.1.0', 'vendor-drift'],
    ['warn  aderyn             not found on PATH (optional)', 'aderyn-not-found'],
    ['{"checks":[{"id":"foundry-version","status":"fail","reason":"x"}]}', 'foundry-version-mismatch'],
  ];
  for (const [text, kind] of cases) assert.equal(matchText(text)?.kind, kind, text.slice(0, 60));
  assert.equal(matchText('Something entirely different happened'), undefined);
  assert.equal(matchErrorName('UserRejectedRequestError').kind, 'user-rejected');
  assert.equal(matchErrorName('ChainMismatchError').kind, 'wallet-wrong-chain');
  assert.equal(matchErrorName('InsufficientFundsError').kind, 'insufficient-funds');
  assert.equal(matchErrorName('SomethingElse'), undefined);
  assert.equal(failureByKind('nope'), undefined);
});
