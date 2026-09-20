// The server over the SDK's in-memory transport: tool list, strict schemas, the key guard,
// every read-only tool, and the two refusals deploy_testnet must make. Chain reads go to a
// local anvil prepared by the pre-flight package's fixture (mocked registry, permission and
// price feed at the recorded addresses).
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { failureByKind, writeRulesFiles } from '@gatedpath/agent-rules';
import { knownAllowed } from '@gatedpath/chains';
import { DOCS_MAP, TOOL_NAMES, faucetStub, lookupDocs } from '../dist/index.js';
import { allow, installRedbellyMocks, installSafe, startAnvil } from '../../preflight/test/anvil.mjs';
import { makeProject } from '../../preflight/test/project.mjs';
import { connect, parse } from './client.mjs';

describe('redbelly-mcp over the in-memory transport', () => {
  let c, anvil, mocks, deployer;
  before(async () => {
    c = await connect();
    anvil = await startAnvil(153);
    mocks = await installRedbellyMocks(anvil);
    await installSafe(anvil);
    deployer = '0x1111111111111111111111111111111111111111'; // not an anvil default account, which pre-flight warns on
    await allow(anvil, mocks.permission, deployer);
    await anvil.rpc('anvil_setBalance', [deployer, '0x' + (10n ** 20n).toString(16)]);
  });
  after(async () => {
    await c.close();
    await anvil.stop();
  });

  test('lists exactly the fourteen tools, each with a strict schema and annotations', async () => {
    const { tools } = await c.client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
    for (const t of tools) {
      assert.equal(t.inputSchema.additionalProperties, false, `${t.name} must reject unknown arguments`);
      assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
      assert.ok(t.description.length > 40, t.name);
    }
    assert.equal(tools.find((t) => t.name === 'deploy_testnet').annotations.readOnlyHint, false);
    assert.equal(tools.find((t) => t.name === 'is_verified').annotations.readOnlyHint, true);
    assert.equal(tools.find((t) => t.name === 'status').annotations.readOnlyHint, false, 'status runs forge build and forge test: the project\'s own code');
    assert.equal(tools.find((t) => t.name === 'explain_failure').annotations.readOnlyHint, true);
    assert.equal(tools.find((t) => t.name === 'doctor').annotations.readOnlyHint, true);
    assert.equal(tools.find((t) => t.name === 'gas_report').annotations.readOnlyHint, false, 'gas_report may run forge test');
    assert.equal(tools.find((t) => t.name === 'ship_report').annotations.readOnlyHint, false, 'ship_report writes a file');
    assert.ok(!tools.some((t) => /faucet/.test(t.name)), 'no faucet tool until RESEARCH.md question 16 is answered');
    assert.equal(faucetStub.status, 'not registered');
  });

  test('an unknown argument is a schema error, not silently dropped', async () => {
    // The SDK validates against the strict schema first and answers with an isError result (-32602).
    const extra = await c.call('chain_info', { chain: 153, extra: 'x' });
    assert.equal(extra.isError, true);
    assert.match(extra.content[0].text, /Unrecognized key: "extra"/);
    const addr = await c.call('is_verified', { address: 'not-an-address', chain: 153 });
    assert.equal(addr.isError, true);
    assert.match(addr.content[0].text, /20-byte hex address/);
    const chain = await c.call('chain_info', { chain: 1 });
    assert.equal(chain.isError, true);
    assert.match(chain.content[0].text, /Invalid input at chain/);
  });

  test('doctor reports one entry per check with the failure table\'s fix text and the next command', async () => {
    const r = parse(await c.call('doctor', { project: mkdtempSync(join(tmpdir(), 'mcp-doctor-')) }));
    assert.equal(r.tool, 'redbelly-doctor');
    assert.deepEqual(r.checks.map((x) => x.id), ['node', 'git', 'forge', 'anvil', 'cast', 'foundry-version', 'foundry-exit-code', 'slither', 'aderyn', 'env-tracked', 'vendor']);
    assert.equal(r.checks.find((x) => x.id === 'node').status, 'pass');
    for (const x of r.checks) if (x.status !== 'pass' && x.kind) assert.equal(x.fix, failureByKind(x.kind).fix.command, x.id);
    assert.match(r.text, /^redbelly-doctor \d/);
    assert.deepEqual(Object.keys(r.next).slice(0, 2), ['command', 'why']);
    const missing = await c.call('doctor', { project: '/nonexistent/for/doctor' });
    assert.equal(missing.isError, true);
  });

  test('anything shaped like a key is refused by every tool before it runs', async () => {
    const hex = 'ab'.repeat(32);
    for (const [name, args] of [
      ['is_verified', { address: knownAllowed.testnet.address, chain: 153, rpc: `http://127.0.0.1:1/${hex}` }],
      ['preflight', { project: `/tmp/${hex}` }],
      ['docs_lookup', { topic: `0x${hex}` }],
      ['deploy_testnet', { project: '/tmp/x', script: 'script/D.s.sol', account: 'deployer', passwordFile: hex }],
      ['verify_routescan', { project: '/tmp/x', address: knownAllowed.testnet.address, contract: 'src/A.sol:A', chain: 153, constructorArgs: `0x${hex}` }],
      ['status', { project: `/tmp/${hex}` }],
      ['explain_failure', { stderr: `PRIVATE_KEY=${hex}` }],
      ['doctor', { project: `/tmp/${hex}` }],
      ['gas_report', { project: `/tmp/${hex}`, chain: 153 }],
      ['ship_report', { project: '/tmp/x', chain: 153, account: 'deployer', passwordFile: hex }],
    ]) {
      const r = await c.call(name, args);
      assert.equal(r.isError, true, name);
      assert.match(r.content[0].text, /Refused: argument .* looks like a secret/, name);
      assert.ok(!r.content[0].text.includes(hex), `${name} must not echo the value`);
    }
    const words = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    const r = await c.call('docs_lookup', { topic: words.slice(0, 80) });
    assert.equal(r.isError, true);
  });

  test('chain_info returns the chain object and dated addresses without touching the network', async () => {
    const r = parse(await c.call('chain_info', { chain: 151 }));
    assert.equal(r.chain.id, 151);
    assert.equal(r.chain.rpcUrls.default.http[0], 'https://governors.mainnet.redbelly.network');
    assert.equal(r.addresses.permission.verifiedOn, '2026-09-12');
    assert.match(r.addresses.safeSingleton.address, /^0x41675C/);
    assert.equal(r.knownAllowed.address, knownAllowed.mainnet.address);
  });

  test('is_verified reads isAllowed through the registry', async () => {
    const yes = parse(await c.call('is_verified', { address: deployer, chain: 153, rpc: anvil.url }));
    assert.equal(yes.allowed, true);
    const no = parse(await c.call('is_verified', { address: anvil.accounts[7], chain: 153, rpc: anvil.url }));
    assert.equal(no.allowed, false);
    assert.match(no.meaning, /access\.redbelly\.network/);
  });

  test('gas_estimate_usd prices gas through the feed', async () => {
    const r = parse(await c.call('gas_estimate_usd', { gas: 21000, chain: 153, rpc: anvil.url }));
    assert.equal(r.usdPerRbnt, 0.002431);
    assert.ok(r.usd > 0);
    assert.match(r.rbnt, /^\d+(\.\d+)?$/);
  });

  test('docs_lookup links and quotes the consequence line; every map entry resolves', async () => {
    const r = parse(await c.call('docs_lookup', { topic: 'gas' }));
    assert.equal(r.url, 'https://vine.redbelly.network/network-fees/');
    assert.match(r.consequence, /^A 21,000-gas transfer costs US\$0\.01\./);
    assert.equal(r.verified, '2026-09-12');
    const alias = parse(await c.call('docs_lookup', { topic: 'KYC' }));
    assert.equal(alias.topic, 'wallet-verification');
    const miss = await c.call('docs_lookup', { topic: 'quantum' });
    assert.equal(miss.isError, true);
    assert.ok(parse(miss).topics.includes('faucet'));
    for (const e of DOCS_MAP) {
      const hit = lookupDocs(e.topic);
      assert.ok(hit && hit.consequence.startsWith(e.rule), e.topic);
      assert.match(hit.url, /^https:\/\/(vine\.redbelly\.network|docs\.redbelly\.network|access\.redbelly\.network|github\.com\/redbellynetwork)(\/|$)/, e.topic);
    }
    const faucet = lookupDocs('faucet');
    assert.match(faucet.consequence, /faucetme\.pro/);
  });

  test('rules_files_check passes on a freshly written set and names drift', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rules-'));
    writeRulesFiles(dir);
    const clean = parse(await c.call('rules_files_check', { project: dir }));
    assert.equal(clean.ok, true);
    assert.equal(clean.drifted.length, 0);
    assert.equal(clean.missing.length, 0);
    writeFileSync(join(dir, 'AGENTS.md'), '# edited\n');
    const drift = parse(await c.call('rules_files_check', { project: dir }));
    assert.equal(drift.ok, false);
    assert.deepEqual(drift.drifted, ['AGENTS.md']);
    assert.match(drift.fix, /^redbelly-agent-rules --out /);
  });

  test('preflight runs the CLI and returns its report', async () => {
    const project = makeProject({ chainId: 153 });
    const r = parse(await c.call('preflight', { project, rpc: anvil.url, address: deployer, admin: anvil.accounts[5], gas: 100000 }));
    assert.equal(r.tool, 'redbelly-preflight');
    assert.equal(r.ok, true);
    assert.equal(r.exitCode, 0);
    assert.equal(r.checks.find((x) => x.id === 'admin-safe').status, 'warn');
    assert.match(r.command, /^redbelly-preflight --project /);
    // An agent cannot switch a check off: `skip` is not in the tool's schema (audit of 2026-09-19, P8).
    const skipping = await c.call('preflight', { project, rpc: anvil.url, address: deployer, gas: 100000, skip: ['slither-report'] });
    assert.equal(skipping.isError, true);
    const bad = parse(await c.call('preflight', { project, rpc: anvil.url, address: '0x3333333333333333333333333333333333333333', gas: 100000 }));
    assert.equal(bad.ok, false);
    assert.equal(bad.exitCode, 1);
  });

  test('deploy_testnet refuses when pre-flight fails, without running forge', async () => {
    const project = makeProject({ chainId: 153 });
    const r = await c.call('deploy_testnet', { project, script: 'script/Deploy.s.sol:Deploy', account: 'nobody', rpc: anvil.url });
    assert.equal(r.isError, true);
    const body = parse(r);
    assert.match(body.error, /refused: pre-flight failed/);
    assert.equal(body.preflight.ok, false);
  });
});

describe('deploy_testnet against an RPC that reports chain 151', () => {
  let c, anvil;
  before(async () => {
    c = await connect();
    anvil = await startAnvil(151);
  });
  after(async () => {
    await c.close();
    await anvil.stop();
  });

  test('is refused outright before pre-flight or forge', async () => {
    const project = makeProject({ chainId: 151 });
    const r = await c.call('deploy_testnet', { project, script: 'script/Deploy.s.sol:Deploy', account: 'deployer', rpc: anvil.url });
    assert.equal(r.isError, true);
    const body = parse(r);
    assert.match(body.error, /refused: this RPC reports chain 151/);
    assert.equal(body.chain, 151);
    assert.equal(body.preflight, undefined, 'pre-flight must not even run');
  });
});
