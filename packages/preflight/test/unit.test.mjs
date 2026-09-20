import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { SAFE_141_CODE_HASHES, checkCompilerPins, codeHash, ignoredPath, mnemonicRun, parseToml, readFoundryConfig, readHardhatConfig, readProjectConfig, scanLine, scanValue } from '../dist/index.js';
import { makeProject } from './project.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('parseToml reads sections, dotted headers, strings, numbers, booleans, arrays and comments', () => {
  const t = parseToml(`# top\n[profile.default]\nsrc = "src" # trailing\nsolc_version = '0.8.30'\noptimizer = true\noptimizer_runs = 1_000\ngas_reports = ["A", "B"]\n[profile.default.fuzz]\nruns = 512\n[rpc_endpoints]\nt = "https://x#notacomment"\n`);
  assert.equal(t['profile.default'].src, 'src');
  assert.equal(t['profile.default'].solc_version, '0.8.30');
  assert.equal(t['profile.default'].optimizer, true);
  assert.equal(t['profile.default'].optimizer_runs, 1000);
  assert.deepEqual(t['profile.default'].gas_reports, ['A', 'B']);
  assert.equal(t['profile.default.fuzz'].runs, 512);
  assert.equal(t['rpc_endpoints'].t, 'https://x#notacomment');
});

test('readFoundryConfig layers a profile over default and accepts solc or solc_version', () => {
  const dir = makeProject({ git: false, slither: false, chainId: 153 });
  const c = readFoundryConfig(join(dir, 'foundry.toml'), 'ci');
  assert.equal(c.kind, 'foundry');
  assert.equal(c.profile, 'ci');
  assert.equal(c.solc, '0.8.30');
  assert.equal(c.evmVersion, 'prague');
  assert.equal(c.chainId, 153);
  assert.equal(c.rpcEndpoints.redbelly_testnet, 'https://governors.testnet.redbelly.network');
  const real = readFoundryConfig(join(here, '..', '..', 'receptor-mock', 'foundry.toml'), 'default');
  assert.equal(real.solc, '0.8.30');
  assert.equal(real.evmVersion, 'prague');
  assert.equal(real.optimizerRuns, 200);
});

test('readHardhatConfig finds the compiler pins and the chosen network', () => {
  const dir = makeProject({ hardhat: true, git: false, slither: false });
  const c = readHardhatConfig(join(dir, 'hardhat.config.ts'), 'redbellyMainnet');
  assert.equal(c.kind, 'hardhat');
  assert.equal(c.solc, '0.8.30');
  assert.equal(c.evmVersion, 'prague');
  assert.equal(c.optimizerRuns, 200);
  assert.equal(c.chainId, 151);
  assert.equal(c.rpcUrl, 'https://governors.mainnet.redbelly.network');
  assert.equal(c.sourceDir, 'contracts');
  const auto = readProjectConfig(dir);
  assert.equal(auto.kind, 'hardhat');
  assert.equal(auto.chainId, null);
});

test('compiler-pins fails on the wrong solc, the wrong EVM and a missing config', () => {
  assert.equal(checkCompilerPins(readProjectConfig(makeProject({ git: false, slither: false }))).status, 'pass');
  const bad = checkCompilerPins(readProjectConfig(makeProject({ solc: '0.8.24', evm: 'cancun', git: false, slither: false })));
  assert.equal(bad.status, 'fail');
  assert.match(bad.reason, /solc is 0\.8\.24, not 0\.8\.30 and evm version is cancun, not prague/);
  assert.equal(checkCompilerPins(readProjectConfig(makeProject({ hardhat: true, evm: 'shanghai', git: false, slither: false }))).status, 'fail');
  assert.equal(checkCompilerPins({ kind: 'none', file: null, profile: null, solc: null, evmVersion: null, optimizerRuns: null, sourceDir: 'src', chainId: null, rpcEndpoints: {}, rpcUrl: null }).status, 'fail');
});

test('scanLine: hashes stay quiet, key shapes do not', () => {
  const hex64 = 'ab'.repeat(32);
  assert.deepEqual(scanLine(`  safeSingleton: '0x${hex64}', // code hash`), []);
  assert.deepEqual(scanLine(`"id": "${hex64}"`), []);
  assert.deepEqual(scanLine(`sha256: ${hex64}`), []);
  assert.deepEqual(scanLine('PRIVATE_KEY=<your key here>'), []);
  assert.deepEqual(scanLine('PRIVATE_KEY=${PRIVATE_KEY}'), []);
  assert.deepEqual(scanLine('PRIVATE_KEY='), []);
  assert.equal(scanLine(`PRIVATE_KEY=${hex64}`).map((m) => m.kind).sort().join(','), 'hex64,key-assignment');
  assert.equal(scanLine(`const deployerKey = "0x${hex64}";`)[0].kind, 'hex64-keyword');
  assert.equal(scanLine(hex64)[0].kind, 'hex64');
  assert.equal(scanLine('MNEMONIC="test test test junk"')[0].kind, 'key-assignment');
  assert.equal(scanLine('"ciphertext": "abc"')[0].kind, 'keystore-json');
});

// Audit 2026-09-19, R3: every shape below passed the history scan. `_` is a word character, so
// `\b` never fired inside REDBELLY_PRIVATE_KEY; and the commonest leak of all, a Hardhat accounts
// array, has no key word on the line.
test('scanLine: the common ways a key is committed are all caught', () => {
  const k = '0x' + 'ab12cd34'.repeat(8); // made up; the shape of a key, not one
  for (const line of [
    `REDBELLY_PRIVATE_KEY=${k}`,
    `export ETH_PRIVATE_KEY="${k}"`,
    `DEPLOYER_PK=${k}`,
    `PK=${k}`,
    `      accounts: ["${k}"],`,
    `    vm.startBroadcast(${k});`,
    `const account = privateKeyToAccount("${k}");`,
    `const wallet = new Wallet('${k}')`,
    `const key = "${k}";`,
    `REDBELLY_PRIVATE_KEY=${k.slice(2)}`,
  ]) {
    assert.ok(scanLine(line).length > 0, `missed: ${line.replace(/(0x)?[0-9a-f]{64}/, '<64hex>')}`);
  }
});

test('scanLine: hashes that are plainly hashes still stay quiet', () => {
  const h = '0x' + 'ab12cd34'.repeat(8);
  for (const line of [
    `  implementation slot: '${h}',`,
    `"transactionHash": "${h}",`,
    `bytes32 constant TOPIC = ${h};`,
    `  safeSingleton: '${h}', // code hash`,
    `salt: ${h}`,
  ]) {
    assert.deepEqual(scanLine(line), [], `false alarm: ${line.replace(/0x[0-9a-f]{64}/, '<64hex>')}`);
  }
  // a role hash that states its own preimage, and the preimage checks out
  const role = '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6'; // keccak256("MINTER_ROLE")
  assert.deepEqual(scanLine(`"role": "${role}" is keccak256("MINTER_ROLE")`), []);
  assert.ok(scanLine(`"role": "${h}" is keccak256("MINTER_ROLE")`).length > 0, 'a false preimage must not pass');
});

test('ignoredPath skips vendor roots, never a folder that merely shares the name', () => {
  for (const f of ['lib/forge-std/src/Vm.sol', 'contracts/lib/x/y.sol', 'contracts/out/A.json', 'node_modules/a/b.js', 'web/node_modules/a.js', 'reports/slither.sources.sha256']) {
    assert.equal(ignoredPath(f), true, f);
  }
  for (const f of ['app/src/lib/wallet.ts', 'web/src/lib/keys.ts', 'src/cache/secrets.ts', 'scripts/out/deploy.sh']) {
    assert.equal(ignoredPath(f), false, f);
  }
});

test('mnemonicRun needs twelve consecutive wordlist words', () => {
  const words = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];
  assert.equal(mnemonicRun(words.join(' ')), true);
  assert.equal(mnemonicRun(`export MNEMONIC="${words.join(' ')}"`), true);
  assert.equal(mnemonicRun(words.slice(0, 11).join(' ')), false);
  assert.equal(mnemonicRun('the quick brown fox jumps over the lazy dog, then sleeps all day long'), false);
});

test('scanValue walks nested tool arguments and names the path', () => {
  const found = scanValue({ project: '/x', nested: { privateKey: 'nope', list: ['0x' + 'cd'.repeat(32)] } });
  assert.ok(found.some((m) => m.path === '$.nested.privateKey' && m.kind === 'key-assignment'));
  assert.ok(found.some((m) => m.path === '$.nested.list[0]' && m.kind === 'hex64'));
  assert.deepEqual(scanValue({ address: '0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76', chain: 153 }), []);
});

test('the Safe 1.4.1 fixtures hash to the values the admin check pins', () => {
  const fixture = (n) => readFileSync(join(here, 'fixtures', 'safe-1.4.1', n), 'utf8').trim();
  assert.equal(codeHash(fixture('safe-singleton.hex')), SAFE_141_CODE_HASHES.safeSingleton);
  assert.equal(codeHash(fixture('safe-l2-singleton.hex')), SAFE_141_CODE_HASHES.safeL2Singleton);
  assert.equal(codeHash(fixture('safe-proxy-factory.hex')), SAFE_141_CODE_HASHES.safeProxyFactory);
  assert.equal(codeHash(fixture('compatibility-fallback-handler.hex')), SAFE_141_CODE_HASHES.safeFallbackHandler);
});
