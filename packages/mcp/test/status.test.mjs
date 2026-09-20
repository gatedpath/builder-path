// status: the order of `next` walked from a bare project to done, against a working copy of
// receptor-mock (its lib/ and node_modules/ linked, nothing in the package touched) and a
// throwaway pre-flight fixture. Network only where the test says so: an rpc that is a local
// anvil with the mocked registry. Needs forge.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { writeRulesFiles } from '@gatedpath/agent-rules';
import { STEPS } from '../dist/index.js';
import { installRedbellyMocks, startAnvil } from '../../preflight/test/anvil.mjs';
import { makeProject } from '../../preflight/test/project.mjs';
import { connect, parse } from './client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const receptorMock = join(here, '..', '..', 'receptor-mock');
const hasForge = spawnSync('forge', ['--version']).status === 0;

/** A copy of receptor-mock's sources with lib/ and node_modules/ linked, so forge builds it without touching the package. */
function copyReceptorMock() {
  const dir = mkdtempSync(join(tmpdir(), 'status-'));
  for (const f of ['foundry.toml', 'remappings.txt', 'src', 'test', 'reports']) cpSync(join(receptorMock, f), join(dir, f), { recursive: true });
  for (const f of ['lib', 'node_modules']) symlinkSync(join(receptorMock, f), join(dir, f));
  return dir;
}

describe('status', { skip: hasForge ? false : 'forge is not installed' }, () => {
  let c, anvil, copy;
  before(async () => {
    c = await connect();
    anvil = await startAnvil(153);
    await installRedbellyMocks(anvil);
    copy = copyReceptorMock();
  });
  after(async () => {
    await c.close();
    await anvil.stop();
    rmSync(copy, { recursive: true, force: true });
  });

  test('the fixed order and the exact shape', async () => {
    assert.deepEqual([...STEPS], ['compile', 'tests', 'five-state tests', 'Slither', 'rules files', 'pre-flight', 'testnet deploy', 'verify', 'ship report']);
    const r = parse(await c.call('status', { project: makeProject({ chainId: 153 }) }));
    for (const k of ['compiles', 'tests', 'slither', 'rulesFiles', 'deployments', 'next']) assert.ok(k in r, k);
    assert.deepEqual(Object.keys(r.tests), ['passed', 'failed', 'fiveState']);
    assert.deepEqual(Object.keys(r.slither), ['present', 'fresh']);
    assert.deepEqual(Object.keys(r.deployments).sort(), ['151', '153', 'local']);
    assert.deepEqual(Object.keys(r.next), ['step', 'command', 'why']);
    assert.equal(r.networkCalls, 'none');
  });

  test('a project with nothing to test stops at tests; a missing project is an error', async () => {
    const r = parse(await c.call('status', { project: makeProject({ chainId: 153 }) }));
    assert.equal(r.compiles, true);
    assert.deepEqual(r.tests, { passed: 0, failed: 0, fiveState: false });
    assert.equal(r.next.step, 'tests');
    assert.equal(r.next.command, 'forge test');
    assert.deepEqual(r.deployments, { local: null, 153: null, 151: null });
    const missing = await c.call('status', { project: '/nonexistent/project' });
    assert.equal(missing.isError, true);
  });

  test('a project that does not compile stops at compile with the words from the failure table', async () => {
    const dir = makeProject({ chainId: 153, git: false, slither: false });
    mkdirSync(join(dir, 'script'), { recursive: true });
    writeFileSync(join(dir, 'script', 'D.s.sol'), '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\nimport {Script} from "forge-std/Script.sol";\ncontract D is Script {}\n');
    const r = parse(await c.call('status', { project: dir }));
    assert.equal(r.compiles, false);
    assert.equal(r.next.step, 'compile');
    assert.match(r.next.why, /forge-std/);
    assert.match(r.next.command, /forge install|contracts:install/);
  });

  test('receptor-mock walks from rules files through pre-flight, deploy, verify and the ship report', async () => {
    let r = parse(await c.call('status', { project: copy }));
    assert.equal(r.compiles, true, JSON.stringify(r.next));
    assert.ok(r.tests.passed >= 30, `passed ${r.tests.passed}`);
    assert.equal(r.tests.failed, 0);
    assert.equal(r.tests.fiveState, true);
    assert.deepEqual([...r.suites].sort(), ['AdaptersTest', 'ForkTest', 'FuzzTest', 'GatedCounterTest']);
    assert.equal(r.slither.present, true);
    assert.equal(r.rulesFiles, 'missing');
    if (r.slither.fresh) {
      assert.equal(r.next.step, 'rules files');
      assert.match(r.next.command, /^redbelly-agent-rules --out /);
    } else {
      assert.equal(r.next.step, 'Slither');
    }
    // a fresh sidecar makes the report current whatever git says about times
    const { hashSources, SOURCES_HASH_FILE } = await import('@gatedpath/preflight');
    writeFileSync(join(copy, 'reports', SOURCES_HASH_FILE), hashSources(join(copy, 'src')) + '\n');
    writeRulesFiles(copy);
    r = parse(await c.call('status', { project: copy }));
    assert.deepEqual(r.slither, { present: true, fresh: true });
    assert.equal(r.rulesFiles, 'match');
    assert.equal(r.next.step, 'pre-flight');
    assert.match(r.next.why, /no network call without rpc/);
    assert.match(r.next.command, /^redbelly-preflight --project .* --chain 153/);
    // drift is named
    writeFileSync(join(copy, 'AGENTS.md'), '# edited\n');
    r = parse(await c.call('status', { project: copy }));
    assert.equal(r.rulesFiles, 'drifted');
    assert.equal(r.next.step, 'rules files');
    assert.match(r.next.why, /AGENTS\.md/);
    writeRulesFiles(copy);

    // with an rpc, pre-flight runs read-only; the fixture has no deployer so the identity checks skip and it passes
    r = parse(await c.call('status', { project: copy, rpc: anvil.url }));
    assert.equal(r.preflight.ran, true);
    assert.equal(r.preflight.ok, true, JSON.stringify(r.preflight.failing));
    assert.equal(r.next.step, 'testnet deploy');
    assert.match(r.next.command, /forge script script\/Deploy\.s\.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast/);
    assert.match(r.next.why, /never signs/);
    assert.match(r.next.why, /local loop/);
    // what the tool tells a builder is about the builder's project, never about this repository's own state
    assert.doesNotMatch(r.next.why, /RESEARCH\.md|CLAUDE\.md|this repository|Redbelly answers/);
    assert.match(r.networkCalls, /pre-flight/);

    // a failing pre-flight (a wrong pin) is the next step, with the check's own reason
    const toml = readFileSync(join(copy, 'foundry.toml'), 'utf8');
    writeFileSync(join(copy, 'foundry.toml'), toml.replace('evm_version = "prague"', 'evm_version = "cancun"'));
    r = parse(await c.call('status', { project: copy, rpc: anvil.url }));
    assert.equal(r.next.step, 'pre-flight');
    assert.match(r.next.why, /^compiler-pins failed:/);
    assert.match(r.next.command, /solc_version/);
    writeFileSync(join(copy, 'foundry.toml'), toml);

    // a testnet record moves past deploy to verify
    mkdirSync(join(copy, 'deployments'), { recursive: true });
    writeFileSync(join(copy, 'deployments', '153-GatedCounter.json'), JSON.stringify({ chainId: 153, contract: '0x1111111111111111111111111111111111111111', deployer: '0x2222222222222222222222222222222222222222' }) + '\n');
    r = parse(await c.call('status', { project: copy }));
    assert.equal(r.deployments[153].records.length, 1);
    assert.equal(r.next.step, 'verify');
    assert.match(r.next.command, /^forge verify-contract 0x1111111111111111111111111111111111111111 src\/GatedCounter\.sol:GatedCounter --verifier etherscan --verifier-url https:\/\/api\.routescan\.io\/v2\/network\/testnet\/evm\/153\/etherscan --etherscan-api-key verifyContract --chain 153 --compiler-version 0\.8\.30 --evm-version prague/);
    assert.match(r.next.why, /Not checked/);
    // verifiedAt in the record moves to the ship report; the report moves to done
    writeFileSync(join(copy, 'deployments', '153-GatedCounter.json'), JSON.stringify({ chainId: 153, contract: '0x1111111111111111111111111111111111111111', verifiedAt: '2026-09-14' }) + '\n');
    r = parse(await c.call('status', { project: copy }));
    assert.equal(r.next.step, 'ship report');
    assert.equal(r.next.command, 'redbelly ship --chain 153 --account <keystore-name>');
    assert.match(r.next.why, /writes the file only when every check passed; the deploy script refuses 151 without one dated today/);
    // A hand-written file (no header) does not finish the step: the deploy script reads the header and
    // refuses without one, so status must not call it done. One that redbelly ship wrote is read from its header.
    writeFileSync(join(copy, 'deployments', 'ship-151-2026-09-13.md'), '# ship\n');
    r = parse(await c.call('status', { project: copy }));
    assert.equal(r.next.step, 'ship report');
    assert.match(r.next.why, /ship-151-2026-09-13\.md \(no redbelly ship header, so the deploy script refuses it, not today; the deploy script wants today's\)/);
    assert.deepEqual(r.shipReports.map((x) => [x.chain, x.date, x.ok, x.today]), [[151, '2026-09-13', null, false]]);
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(join(copy, 'deployments', `ship-153-${today}.md`), `<!-- redbelly-ship chain=153 date=${today} ok=true generatedAt=2026-09-14T00:00:00.000Z -->\n# Ship report\n`);
    r = parse(await c.call('status', { project: copy }));
    assert.match(r.next.why, new RegExp(`ship-153-${today}\\.md \\(every check passed, dated today\\)`));

    // Audit 2026-09-19, R6: the name is not the report. A testnet report under the mainnet gate's name
    // must not read as a passing mainnet report, and a file with no header is one the deploy script refuses.
    writeFileSync(join(copy, 'deployments', `ship-151-${today}.md`), `<!-- redbelly-ship chain=153 date=${today} ok=true generatedAt=2026-09-14T00:00:00.000Z -->\n# Ship report\n`);
    r = parse(await c.call('status', { project: copy }));
    const misnamed = r.shipReports.find((x) => x.chain === 151 && x.date === today);
    assert.equal(misnamed.ok, false);
    assert.equal(misnamed.headerMatchesName, false);
    assert.match(r.next.why, new RegExp(`ship-151-${today}\\.md \\(its header is for chain 153`));
    assert.match(r.next.why, /ship-151-2026-09-13\.md \(no redbelly ship header, so the deploy script refuses it/);
    rmSync(join(copy, 'deployments', `ship-151-${today}.md`));

    // deployments.local reads what npm run dev writes; broadcast folders are read too
    const local = { chainId: 31337, forkOf: 153, verifier: '0x3333333333333333333333333333333333333333', contract: '0x4444444444444444444444444444444444444444', requestId: 18, wallets: [], startedAt: '2026-09-14T00:00:00Z' };
    writeFileSync(join(copy, 'deployments', 'local.json'), JSON.stringify(local) + '\n');
    mkdirSync(join(copy, 'broadcast', 'Deploy.s.sol', '151'), { recursive: true });
    writeFileSync(join(copy, 'broadcast', 'Deploy.s.sol', '151', 'run-latest.json'), JSON.stringify({ transactions: [{ transactionType: 'CREATE', contractName: 'GatedCounter', contractAddress: '0x5555555555555555555555555555555555555555', hash: null }] }) + '\n');
    r = parse(await c.call('status', { project: copy }));
    assert.deepEqual(r.deployments.local, local);
    assert.equal(r.deployments[151].broadcast[0].deployed[0].address, '0x5555555555555555555555555555555555555555');
  });

  test('a scaffold layout (contracts/ under the root) is recognised and its commands say cd contracts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts', 'dev.mjs'), '// stub\n');
    writeFileSync(join(root, 'package.json'), '{"name":"x","scripts":{"contracts:install":"x"}}\n');
    const contracts = join(root, 'contracts');
    mkdirSync(join(contracts, 'src'), { recursive: true });
    mkdirSync(join(contracts, 'script'));
    writeFileSync(join(contracts, 'foundry.toml'), '[profile.default]\nsrc = "src"\nsolc_version = "0.8.30"\nevm_version = "prague"\n');
    writeFileSync(join(contracts, 'src', 'A.sol'), '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\ncontract A {}\n');
    writeFileSync(join(contracts, 'script', 'D.s.sol'), '// SPDX-License-Identifier: MIT\npragma solidity 0.8.30;\nimport {Script} from "forge-std/Script.sol";\ncontract D is Script {}\n');
    const r = parse(await c.call('status', { project: root }));
    assert.equal(r.scaffold, true);
    assert.equal(r.contracts, contracts);
    assert.equal(r.next.step, 'compile');
    assert.equal(r.next.command, 'npm run contracts:install');
    const same = parse(await c.call('status', { project: contracts }));
    assert.equal(same.scaffold, true, 'pointing at contracts/ finds the same root');
    assert.equal(same.next.command, 'npm run contracts:install');
    assert.ok(!existsSync(join(root, 'deployments')));
  });
});
