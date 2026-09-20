// The tools that drive forge, against the receptor-mock package and a throwaway project on a
// local anvil (chain 153). Skipped when forge is not installed. deploy_testnet is exercised
// end to end with a keystore that cast creates and encrypts on the spot; no key is ever
// printed, read or passed as an argument.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { knownAllowed } from '@gatedpath/chains';
import { allow, installRedbellyMocks, startAnvil } from '../../preflight/test/anvil.mjs';
import { commit, gitInit } from '../../preflight/test/project.mjs';
import { connect, parse } from './client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const receptorMock = join(here, '..', '..', 'receptor-mock');
const hasForge = spawnSync('forge', ['--version']).status === 0 && spawnSync('cast', ['--version']).status === 0;

describe('forge-backed tools', { skip: hasForge ? false : 'forge and cast are not installed' }, () => {
  let c;
  before(async () => {
    c = await connect();
  });
  after(async () => c.close());

  test('five_state_tests finds the GatedTest suites in receptor-mock and runs them', async () => {
    const r = parse(await c.call('five_state_tests', { project: receptorMock }));
    assert.deepEqual([...r.suites].sort(), ['AdaptersTest', 'ForkTest', 'FuzzTest', 'GatedCounterTest']);
    assert.equal(r.failed, 0);
    assert.ok(r.passed >= 20, `passed ${r.passed}`);
    assert.equal(r.ok, true);
    assert.match(r.command, /forge test --match-contract/);
    const none = await c.call('five_state_tests', { project: mkdtempSync(join(tmpdir(), 'nofoundry-')) });
    assert.equal(none.isError, true);
  });

  // Audit 2026-09-19, R7. These tools run the project's own tests, in a folder the agent chooses. With
  // `ffi = true` a test can run any shell command, and a client may auto-approve a tool marked
  // read-only, so: refuse such a project, and stop calling a tool that runs forge read-only.
  test('a project with ffi switched on is refused by every tool that runs forge, and none of them claims to be read-only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffi-project-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'test'), { recursive: true });
    writeFileSync(join(dir, 'foundry.toml'), '[profile.default]\nsrc = "src"\ntest = "test"\nffi = true\n');
    writeFileSync(join(dir, 'src', 'A.sol'), '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\ncontract A {}\n');
    for (const tool of ['status', 'five_state_tests', 'gas_report']) {
      const r = await c.call(tool, { project: dir });
      assert.equal(r.isError, true, `${tool} ran forge in a project with ffi = true`);
      assert.match(r.content[0].text, /ffi = true/, tool);
    }
    // file access to the whole project, or outside it, is refused the same way; the scaffold's own ./deployments is not
    writeFileSync(join(dir, 'foundry.toml'), '[profile.default]\nsrc = "src"\nfs_permissions = [{ access = "read-write", path = "../" }]\n');
    const wide = await c.call('five_state_tests', { project: dir });
    assert.equal(wide.isError, true);
    assert.match(wide.content[0].text, /gives forge file access to .{0,2}\.\.\//); // the text is JSON, so the quote is escaped
    writeFileSync(join(dir, 'foundry.toml'), '[profile.default]\nsrc = "src"\nfs_permissions = [{ access = "read-write", path = "./deployments" }]\n');
    const narrow = await c.call('five_state_tests', { project: dir });
    assert.doesNotMatch(narrow.content[0].text, /file access|ffi = true/);

    const tools = await c.client.listTools();
    for (const name of ['status', 'five_state_tests', 'gas_report', 'ship_report', 'deploy_testnet']) {
      const t = tools.tools.find((x) => x.name === name);
      assert.equal(t.annotations.readOnlyHint, false, `${name} runs the project's code; it is not read-only`);
    }
    for (const name of ['status', 'five_state_tests', 'gas_report']) {
      assert.equal(tools.tools.find((x) => x.name === name).annotations.destructiveHint, false, `${name} changes nothing of the user's`);
    }
  });

  test('verify_routescan dry-runs the Routescan recipe against GatedCounter and submits nothing', async () => {
    const r = parse(await c.call('verify_routescan', { project: receptorMock, address: knownAllowed.testnet.address, contract: 'test/examples/GatedCounter.sol:GatedCounter', chain: 153 }));
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 2000));
    assert.equal(r.nothingSubmitted, true);
    assert.equal(r.dryRun, true);
    assert.equal(r.verifierUrl, 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan');
    assert.match(r.command, /--etherscan-api-key verifyContract/);
    assert.match(r.command, /--compiler-version 0\.8\.30 --evm-version prague --num-of-optimizations 200 --show-standard-json-input$/);
    assert.equal(r.standardJsonInput.evmVersion, 'prague');
    assert.equal(r.standardJsonInput.optimizerRuns, 200);
    assert.ok(r.standardJsonInput.sources.includes('test/examples/GatedCounter.sol'));
    assert.ok(r.standardJsonInput.sources.includes('src/Gated.sol'));
    const main = parse(await c.call('verify_routescan', { project: receptorMock, address: knownAllowed.testnet.address, contract: 'test/examples/GatedCounter.sol:GatedCounter', chain: 151 }));
    assert.equal(main.verifierUrl, 'https://api.routescan.io/v2/network/mainnet/evm/151/etherscan');
  });
});

describe('deploy_testnet end to end on a local chain 153', { skip: hasForge ? false : 'forge and cast are not installed' }, () => {
  let c, anvil, mocks, project, home, passwordFile, address;
  const savedHome = process.env.HOME;
  before(async () => {
    c = await connect();
    anvil = await startAnvil(153);
    mocks = await installRedbellyMocks(anvil);

    // A keystore cast creates and encrypts itself. HOME points at a temp dir so forge finds it
    // under $HOME/.foundry/keystores without touching the real one.
    home = mkdtempSync(join(tmpdir(), 'home-'));
    mkdirSync(join(home, '.foundry', 'keystores'), { recursive: true });
    passwordFile = join(home, 'password.txt');
    writeFileSync(passwordFile, 'mcp-test-password\n');
    const created = execFileSync('cast', ['wallet', 'new', join(home, '.foundry', 'keystores'), 'deployer', '--unsafe-password', 'mcp-test-password'], { encoding: 'utf8' });
    address = /0x[0-9a-fA-F]{40}/.exec(created)[0];
    await allow(anvil, mocks.permission, address);
    await anvil.rpc('anvil_setBalance', [address, '0x' + (10n ** 20n).toString(16)]);
    process.env.HOME = home;

    // A minimal Foundry project: one contract, one script, forge-std borrowed from receptor-mock.
    project = mkdtempSync(join(tmpdir(), 'deploy-'));
    mkdirSync(join(project, 'src'));
    mkdirSync(join(project, 'script'));
    mkdirSync(join(project, 'lib'));
    symlinkSync(join(receptorMock, 'lib', 'forge-std'), join(project, 'lib', 'forge-std'));
    writeFileSync(join(project, 'foundry.toml'), '[profile.default]\nsrc = "src"\nout = "out"\nlibs = ["lib"]\nsolc_version = "0.8.30"\nevm_version = "prague"\nchain_id = 153\n');
    writeFileSync(join(project, 'remappings.txt'), 'forge-std/=lib/forge-std/src/\n');
    writeFileSync(join(project, 'src', 'Tiny.sol'), '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\ncontract Tiny { uint256 public x = 1; }\n');
    writeFileSync(join(project, 'script', 'Deploy.s.sol'), '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\nimport {Script} from "forge-std/Script.sol";\nimport {Tiny} from "../src/Tiny.sol";\ncontract Deploy is Script {\n    function run() external returns (Tiny t) {\n        vm.startBroadcast();\n        t = new Tiny();\n        vm.stopBroadcast();\n    }\n}\n');
    writeFileSync(join(project, '.gitignore'), 'out/\ncache/\nbroadcast/\nlib/\n');
    gitInit(project);
    commit(project, 'sources', '2026-09-10T10:00:00Z');
    mkdirSync(join(project, 'reports'));
    writeFileSync(join(project, 'reports', 'slither.json'), '{"success":true,"results":{}}\n');
    commit(project, 'slither', '2026-09-11T10:00:00Z');
  });
  after(async () => {
    process.env.HOME = savedHome;
    await c.close();
    await anvil.stop();
  });

  test('pre-flight passes, forge script broadcasts with --account, and the contract has code', async () => {
    const r = await c.call('deploy_testnet', { project, script: 'script/Deploy.s.sol:Deploy', account: 'deployer', passwordFile, rpc: anvil.url, gas: 200000 });
    const body = parse(r);
    assert.equal(r.isError ?? false, false, JSON.stringify(body).slice(0, 3000));
    assert.equal(body.ok, true);
    assert.equal(body.chain, 153);
    assert.equal(body.preflight.ok, true);
    assert.equal(body.preflight.deployer.toLowerCase(), address.toLowerCase());
    assert.match(body.command, /^forge script script\/Deploy\.s\.sol:Deploy --rpc-url http:\/\/127\.0\.0\.1:\d+ --account deployer --broadcast --password-file /);
    assert.ok(body.deployed.length >= 1, body.stdout);
    assert.equal(body.deployed[0].contractName, 'Tiny');
    assert.match(body.broadcast, /broadcast\/Deploy\.s\.sol\/153\/run-latest\.json$/);
    const code = await anvil.rpc('eth_getCode', [body.deployed[0].address, 'latest']);
    assert.ok(code.length > 2, 'deployed contract has code');
    assert.ok(!JSON.stringify(body).includes('mcp-test-password'), 'the password never appears in the result');
  });
});
