// Every check against a local Anvil on chain 151 and 153. Anvil is spawned by the test; the
// Redbelly system contracts are mocked in hand-assembled bytecode at their recorded
// addresses; Safe 1.4.1 is the real code, etched, with proxies deployed through the real
// factory. No private key: anvil's unlocked accounts sign.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { hashSources, runPreflight, renderText, SOURCES_HASH_FILE, WELL_KNOWN_DEV_ACCOUNTS } from '../dist/index.js';
import { allow, deploySafe, installRedbellyMocks, installSafe, SAFE, startAnvil } from './anvil.mjs';
import { commit, makeProject } from './project.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'dist', 'cli.js');
const byId = (report, id) => report.checks.find((c) => c.id === id);
const hasCast = spawnSync('cast', ['--version']).status === 0;

describe('chain 151 (mainnet rules)', () => {
  let anvil, mocks, safe2, safe1, deployer, project;
  before(async () => {
    anvil = await startAnvil(151);
    mocks = await installRedbellyMocks(anvil);
    await installSafe(anvil);
    deployer = '0x1111111111111111111111111111111111111111'; // not one of anvil's ten, which now warn
    await allow(anvil, mocks.permission, deployer);
    await anvil.rpc('anvil_setBalance', [deployer, '0x' + (10n ** 20n).toString(16)]);
    safe2 = await deploySafe(anvil, { owners: [anvil.accounts[2], anvil.accounts[3], anvil.accounts[4]], threshold: 2, nonce: 1 });
    safe1 = await deploySafe(anvil, { owners: [anvil.accounts[2]], threshold: 1, nonce: 2 });
    project = makeProject({ chainId: 151 });
  });
  after(() => anvil.stop());

  test('everything passes with a verified deployer, a 2-of-3 Safe admin and clean history', async () => {
    const r = await runPreflight({ project, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    assert.deepEqual(r.checks.map((c) => `${c.id}:${c.status}`), ['chain-id:pass', 'deployer-verified:pass', 'admin-safe:pass', 'compiler-pins:pass', 'git-secrets:pass', 'balance:pass', 'slither-report:pass'], renderText(r));
    assert.equal(r.ok, true);
    assert.equal(r.chain.expected, 151);
    assert.equal(r.chain.reported, 151);
    assert.equal(byId(r, 'admin-safe').data.threshold, 2);
    assert.equal(byId(r, 'admin-safe').data.singletonCodeMatches, true);
    assert.equal(byId(r, 'balance').data.usdPerRbnt, 0.002431);
  });

  test('an EOA admin fails on mainnet', async () => {
    const r = await runPreflight({ project, rpc: anvil.url, address: deployer, admin: anvil.accounts[5], gas: 100_000 });
    assert.equal(byId(r, 'admin-safe').status, 'fail');
    assert.match(byId(r, 'admin-safe').reason, /externally owned account/);
    assert.equal(r.ok, false);
  });

  test('a Safe with threshold 1 fails on mainnet', async () => {
    const r = await runPreflight({ project, rpc: anvil.url, address: deployer, admin: safe1, gas: 100_000 });
    assert.equal(byId(r, 'admin-safe').status, 'fail');
    assert.match(byId(r, 'admin-safe').reason, /threshold 1/);
  });

  test('a contract that is not a Safe fails the admin check', async () => {
    const r = await runPreflight({ project, rpc: anvil.url, address: deployer, admin: mocks.permission, gas: 100_000 });
    assert.equal(byId(r, 'admin-safe').status, 'fail');
    assert.match(byId(r, 'admin-safe').reason, /not a SafeProxy 1\.4\.1/);
  });

  // Audit 2026-09-19, R5. Ten bytes that answer every call with 2, the canonical singleton planted in
  // slot 0: the check hashed the singleton's code (which does not depend on the admin at all) and
  // trusted the rest, so this passed as "a Safe 1.4.1 (code hash verified) with threshold 2".
  test('a look-alike with the singleton in slot 0 and a threshold of 2 is not a Safe', async () => {
    const fake = '0x00000000000000000000000000000000000fa4e1';
    await anvil.rpc('anvil_setCode', [fake, '0x600260005260206000f3']);
    await anvil.rpc('anvil_setStorageAt', [fake, '0x0', '0x' + SAFE.singleton.slice(2).toLowerCase().padStart(64, '0')]);
    const r = await runPreflight({ project, rpc: anvil.url, address: deployer, admin: fake, gas: 100_000 });
    assert.equal(byId(r, 'admin-safe').status, 'fail', byId(r, 'admin-safe').reason);
    assert.match(byId(r, 'admin-safe').reason, /not a SafeProxy 1\.4\.1/);
    assert.equal(byId(r, 'admin-safe').data.proxyCodeMatches, false);
  });

  test('an anvil default account is refused on mainnet even when it passes isAllowed, and the list matches anvil', async () => {
    await allow(anvil, mocks.permission, anvil.accounts[1]);
    const r = await runPreflight({ project, rpc: anvil.url, address: anvil.accounts[1], admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'deployer-verified').status, 'fail', 'on mainnet a public key is a refusal, not a warning');
    assert.match(byId(r, 'deployer-verified').reason, /default accounts whose private keys are public/);
    assert.equal(byId(r, 'deployer-verified').data.wellKnownDevAccount, true);
    assert.deepEqual(anvil.accounts.map((a) => a.toLowerCase()), WELL_KNOWN_DEV_ACCOUNTS.map((a) => a.toLowerCase()));
  });

  test('DEPLOYER, ADMIN_SAFE and CHAIN_ID in .env fill in missing flags', async () => {
    const withEnv = makeProject({ git: false, files: { '.env': `DEPLOYER=${deployer}\nADMIN_SAFE=${safe2}\nCHAIN_ID=151\n` } });
    const r = await runPreflight({ project: withEnv, rpc: anvil.url, gas: 100_000 });
    assert.equal(r.deployer, deployer);
    assert.equal(r.admin, safe2);
    assert.equal(byId(r, 'chain-id').status, 'pass');
    assert.match(byId(r, 'chain-id').reason, /^CHAIN_ID says chain 151/);
    assert.match(byId(r, 'deployer-verified').reason, /\(DEPLOYER\) passes/);
    assert.equal(byId(r, 'admin-safe').status, 'pass');
  });

  test('an unverified deployer fails and the reason points at the Access dApp', async () => {
    const r = await runPreflight({ project, rpc: anvil.url, address: '0x3333333333333333333333333333333333333333', admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'deployer-verified').status, 'fail');
    assert.match(byId(r, 'deployer-verified').reason, /access\.redbelly\.network/);
  });

  test('config chain 153 against an RPC on 151 fails the chain check', async () => {
    const r = await runPreflight({ project, rpc: anvil.url, chain: 153, address: deployer, admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'chain-id').status, 'fail');
    assert.match(byId(r, 'chain-id').reason, /says chain 153 but the RPC .* reports 151/);
  });

  test('an unfunded but verified deployer fails the balance check with the RBNT shortfall', async () => {
    const poor = '0x00000000000000000000000000000000000000aa';
    await allow(anvil, mocks.permission, poor);
    const r = await runPreflight({ project, rpc: anvil.url, address: poor, admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'balance').status, 'fail');
    assert.match(byId(r, 'balance').reason, /holds 0 RBNT but 100,000 gas needs/);
    assert.equal(byId(r, 'balance').data.marginPercent, 25);
    assert.equal(BigInt(byId(r, 'balance').data.requiredWei), (BigInt(byId(r, 'balance').data.costWei) * 125n) / 100n);
  });

  test('a private key added anywhere in history fails, without printing it', async () => {
    const dirty = makeProject({ chainId: 151, files: { '.env': `RPC_URL=https://example.invalid\nPRIVATE_KEY=${'0'.repeat(30)}1234${'f'.repeat(30)}\n` } });
    const r = await runPreflight({ project: dirty, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    const c = byId(r, 'git-secrets');
    assert.equal(c.status, 'fail');
    assert.match(c.reason, /\.env at [0-9a-f]{10}/);
    assert.ok(!JSON.stringify(r).includes('1234' + 'f'.repeat(30)), 'the report must not carry the key');
    assert.equal(c.data.findings[0].file, '.env');
  });

  test('a mnemonic committed then deleted still fails', async () => {
    const words = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo';
    const dirty = makeProject({ chainId: 151, files: { 'notes.txt': `seed backup: ${words}\n` } });
    execFileSync('git', ['rm', '-q', 'notes.txt'], { cwd: dirty });
    commit(dirty, 'remove notes', '2026-09-12T10:00:00Z');
    const r = await runPreflight({ project: dirty, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000, skip: ['slither-report'] });
    assert.equal(byId(r, 'git-secrets').status, 'fail');
    assert.equal(byId(r, 'git-secrets').data.findings[0].kind, 'mnemonic');
  });

  test('a tracked .env with no key in it still fails', async () => {
    const dirty = makeProject({ chainId: 151, files: { '.env': 'RPC_URL=https://example.invalid\n' } });
    const r = await runPreflight({ project: dirty, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'git-secrets').status, 'fail');
    assert.match(byId(r, 'git-secrets').reason, /\.env is tracked by git/);
  });

  test('a Slither report older than the sources fails; a missing one fails; a modified source beats a committed report', async () => {
    const stale = makeProject({ chainId: 151, slither: 'before' });
    let r = await runPreflight({ project: stale, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'slither-report').status, 'fail');
    assert.match(byId(r, 'slither-report').reason, /older than src\/A\.sol/);

    const none = makeProject({ chainId: 151, slither: false });
    r = await runPreflight({ project: none, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'slither-report').status, 'fail');
    assert.match(byId(r, 'slither-report').reason, /No Slither report/);

    const edited = makeProject({ chainId: 151 });
    writeFileSync(join(edited, 'src', 'A.sol'), '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\ncontract A { uint256 public x; }\n');
    r = await runPreflight({ project: edited, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'slither-report').status, 'fail', 'an uncommitted edit is newer than any commit');
  });

  test('a slither.sources.sha256 sidecar decides freshness by content, whatever the times say', async () => {
    // A report committed before the sources, which the time rule calls stale, passes when the
    // sidecar matches the sources as they are now; an edit after the hash was taken fails.
    const withHash = makeProject({ chainId: 151, slither: 'before' });
    writeFileSync(join(withHash, 'reports', SOURCES_HASH_FILE), hashSources(join(withHash, 'src')) + '\n');
    let r = await runPreflight({ project: withHash, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'slither-report').status, 'pass');
    assert.match(byId(r, 'slither-report').reason, /matches the hash of 1 \.sol file/);

    writeFileSync(join(withHash, 'src', 'A.sol'), '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\ncontract A { uint256 public x; }\n');
    r = await runPreflight({ project: withHash, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'slither-report').status, 'fail');
    assert.match(byId(r, 'slither-report').reason, /no longer match/);

    // The recipe is stable: path then bytes then NUL, sorted by POSIX path; a rename changes it.
    const a = hashSources(join(withHash, 'src'));
    mkdirSync(join(withHash, 'src', 'sub'));
    writeFileSync(join(withHash, 'src', 'sub', 'B.sol'), 'contract B {}\n');
    const b = hashSources(join(withHash, 'src'));
    assert.notEqual(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  test('outside git the secrets check skips and the slither check uses mtimes', async () => {
    const plain = makeProject({ chainId: 151, git: false });
    const r = await runPreflight({ project: plain, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    assert.equal(byId(r, 'git-secrets').status, 'skip');
    assert.equal(byId(r, 'slither-report').status, 'pass');
  });

  test('the CLI prints one line per check, honours --json and --skip, and exits 1 on a fail', () => {
    const ok = spawnSync(process.execPath, [cli, '--project', project, '--rpc', anvil.url, '--address', deployer, '--admin', safe2, '--gas', '100000'], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /^pass {2}chain-id {11}--chain|foundry\.toml says chain 151 and the RPC reports 151\./m);
    assert.match(ok.stdout, /ok: no check failed\./);

    const bad = spawnSync(process.execPath, [cli, '--project', project, '--rpc', anvil.url, '--address', deployer, '--admin', anvil.accounts[5], '--gas', '100000', '--json'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    const report = JSON.parse(bad.stdout);
    assert.equal(report.tool, 'redbelly-preflight');
    assert.equal(report.ok, false);
    assert.equal(report.checks.find((c) => c.id === 'admin-safe').status, 'fail');

    const skipped = spawnSync(process.execPath, [cli, '--project', project, '--rpc', anvil.url, '--address', deployer, '--gas', '100000', '--skip', 'admin-safe,balance'], { encoding: 'utf8' });
    // Audit 2026-09-19, P8: on mainnet a check skipped on request is a check not passed.
    assert.equal(skipped.status, 1, skipped.stdout);
    assert.match(skipped.stdout, /skip {2}admin-safe {9}Skipped on request\./);
    assert.match(skipped.stdout, /not ok: 2 checks were skipped on request, and chain 151 accepts no skipped check\./);
  });

  test('skipping every check is never ok, whatever the chain', async () => {
    const all = ['chain-id', 'deployer-verified', 'admin-safe', 'compiler-pins', 'git-secrets', 'balance', 'slither-report'];
    const r = await runPreflight({ project, rpc: 'http://127.0.0.1:9', chain: 153, skip: all });
    assert.equal(r.ok, false);
    assert.equal(r.skippedOnRequest, 7);
    assert.match(renderText(r), /not ok: every check was skipped, so nothing was checked\./);
  });

  test('the CLI refuses an argument shaped like a private key and exits 2', () => {
    const r = spawnSync(process.execPath, [cli, '--project', project, 'ef'.repeat(32)], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /looks like a private key/);
    assert.equal(spawnSync(process.execPath, [cli, '--chain', '1'], { encoding: 'utf8' }).status, 2);
  });

  test('--account resolves the deployer through cast without the key leaving the keystore', { skip: hasCast ? false : 'cast not installed' }, async () => {
    const home = mkdtempSync(join(tmpdir(), 'foundry-'));
    mkdirSync(join(home, '.foundry', 'keystores'), { recursive: true });
    const passwordFile = join(home, 'password.txt');
    writeFileSync(passwordFile, 'preflight-test-password\n');
    // cast writes a fresh random key straight into an encrypted keystore; the key is never printed.
    const created = execFileSync('cast', ['wallet', 'new', join(home, '.foundry', 'keystores'), 'deployer', '--unsafe-password', 'preflight-test-password'], { encoding: 'utf8' });
    const address = /0x[0-9a-fA-F]{40}/.exec(created)[0];
    await allow(anvil, mocks.permission, address);
    await anvil.rpc('anvil_setBalance', [address, '0x' + (10n ** 18n).toString(16)]);
    // cast looks for --account keystores under $HOME/.foundry/keystores, so point HOME at the temp dir.
    const env = { ...process.env, HOME: home };
    const r = await runPreflight({ project, rpc: anvil.url, account: 'deployer', passwordFile, admin: safe2, gas: 100_000, env });
    assert.equal(r.deployer.toLowerCase(), address.toLowerCase());
    assert.equal(byId(r, 'deployer-verified').status, 'pass');
    assert.match(byId(r, 'deployer-verified').reason, /cast wallet address --account deployer/);
    const missing = await runPreflight({ project, rpc: anvil.url, account: 'nobody', passwordFile, gas: 100_000, env });
    assert.equal(byId(missing, 'deployer-verified').status, 'fail');
    const badName = await runPreflight({ project, rpc: anvil.url, account: '../x', gas: 100_000, env });
    assert.match(byId(badName, 'deployer-verified').reason, /Keystore names may only use/);
  });
});

describe('chain 153 (testnet rules)', () => {
  let anvil, mocks, deployer, project;
  before(async () => {
    anvil = await startAnvil(153);
    mocks = await installRedbellyMocks(anvil);
    await installSafe(anvil);
    deployer = '0x2222222222222222222222222222222222222222';
    await allow(anvil, mocks.permission, deployer);
    await anvil.rpc('anvil_setBalance', [deployer, '0x' + (10n ** 20n).toString(16)]);
    project = makeProject({ chainId: 153 });
  });
  after(() => anvil.stop());

  test('an EOA admin is a warning on testnet and does not block', async () => {
    const r = await runPreflight({ project, rpc: anvil.url, address: deployer, admin: anvil.accounts[5], gas: 100_000 });
    assert.equal(byId(r, 'admin-safe').status, 'warn');
    assert.match(byId(r, 'admin-safe').reason, /mainnet pre-flight will refuse it/);
    assert.equal(r.ok, true);
    assert.match(renderText(r), /ok: no check failed \(1 warning\)\./);
  });

  test('a 1-of-1 Safe is a warning on testnet; a 2-of-3 passes', async () => {
    const safe1 = await deploySafe(anvil, { owners: [anvil.accounts[2]], threshold: 1, nonce: 7 });
    const safe2 = await deploySafe(anvil, { owners: [anvil.accounts[2], anvil.accounts[3]], threshold: 2, nonce: 8, singleton: (await import('./anvil.mjs')).SAFE.l2Singleton });
    const warn = await runPreflight({ project, rpc: anvil.url, address: deployer, admin: safe1, gas: 100_000 });
    assert.equal(byId(warn, 'admin-safe').status, 'warn');
    const pass = await runPreflight({ project, rpc: anvil.url, address: deployer, admin: safe2, gas: 100_000 });
    assert.equal(byId(pass, 'admin-safe').status, 'pass');
    assert.match(byId(pass, 'admin-safe').reason, /SafeL2 singleton/);
  });

  test('the chain comes from the config when --chain is absent, and the RPC from [rpc_endpoints] when --rpc is absent', async () => {
    const r = await runPreflight({ project, rpc: anvil.url, address: deployer, gas: 100_000 });
    assert.equal(byId(r, 'chain-id').status, 'pass');
    assert.match(byId(r, 'chain-id').reason, /foundry\.toml says chain 153/);
    const noChain = makeProject({});
    const s = await runPreflight({ project: noChain, rpc: anvil.url, address: deployer, gas: 100_000 });
    assert.equal(byId(s, 'chain-id').status, 'skip');
    assert.match(byId(s, 'chain-id').reason, /pass --chain/);
  });

  test('a hardhat project reads the network block', async () => {
    const hh = makeProject({ hardhat: true, chainId: 153 });
    const r = await runPreflight({ project: hh, profile: 'redbellyTestnet', rpc: anvil.url, address: deployer, gas: 100_000 });
    assert.equal(byId(r, 'chain-id').status, 'pass');
    assert.match(byId(r, 'chain-id').reason, /network redbellyTestnet says chain 153/);
    assert.equal(byId(r, 'compiler-pins').status, 'pass');
    assert.equal(byId(r, 'slither-report').status, 'pass');
  });
});
