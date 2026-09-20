// redbelly ship on a local chain 151 with the mocked registry, the real Safe 1.4.1 bytecode and a
// keystore cast creates on the spot (HOME points at a temp dir; no key is ever printed or read by
// this test). The project is a working copy of the contract kit, whose suites inherit GatedTest and
// whose foundry.toml names GatedERC20 in gas_reports. Proves: every check passing writes the report
// with the header, the checks, the readings and the gas table; a Safe at threshold 1 refuses and
// writes nothing; 153 without an admin writes with warnings; a deployment record fills in the
// contract section with the constructor arguments and the verify command.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { hashSources, parseShipHeader, runShip, shipReportPath, utcDate, SOURCES_HASH_FILE, findGatedSuites } from '../dist/index.js';
import { allow, deploySafe, installRedbellyMocks, installSafe, startAnvil } from './anvil.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const redbelly = join(here, '..', 'dist', 'redbelly.js');
const kit = join(here, '..', '..', 'contract-kit');
const hasFoundry = ['forge', 'cast', 'anvil'].every((t) => spawnSync(t, ['--version']).status === 0);

/** The contract kit's sources with lib/ and node_modules/ linked, a Slither report with a matching sidecar, and a git history. */
function copyKit() {
  const dir = mkdtempSync(join(tmpdir(), 'ship-kit-'));
  for (const f of ['foundry.toml', 'remappings.txt', 'src', 'test', 'script']) cpSync(join(kit, f), join(dir, f), { recursive: true });
  for (const f of ['lib', 'node_modules']) symlinkSync(join(kit, f), join(dir, f));
  mkdirSync(join(dir, 'reports'));
  writeFileSync(join(dir, 'reports', 'slither.json'), '{"success":true,"results":{"detectors":[]}}\n');
  writeFileSync(join(dir, 'reports', SOURCES_HASH_FILE), hashSources(join(dir, 'src')) + '\n');
  // reports/ stays out of git: the sources hash is a bare 64-hex value, which the secrets scan flags in history (the scaffold ignores it the same way).
  writeFileSync(join(dir, '.gitignore'), 'out/\ncache/\nlib\nnode_modules\nreports/\ndeployments/\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=ship tests', 'add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=ship tests', 'commit', '-q', '-m', 'kit'], { cwd: dir });
  return dir;
}

describe('redbelly ship on a local chain 151', { skip: hasFoundry ? false : 'forge, cast and anvil are needed' }, () => {
  let anvil, mocks, safe2, safe1, home, deployer, project, env;
  before(async () => {
    anvil = await startAnvil(151);
    mocks = await installRedbellyMocks(anvil);
    await installSafe(anvil);
    await anvil.rpc('anvil_setNextBlockBaseFeePerGas', ['0x' + (202_118n * 10n ** 9n).toString(16)]);
    await anvil.rpc('evm_mine', []);
    // A keystore cast creates and encrypts itself under a temp HOME. The address is all this test reads.
    home = mkdtempSync(join(tmpdir(), 'ship-home-'));
    mkdirSync(join(home, '.foundry', 'keystores'), { recursive: true });
    writeFileSync(join(home, 'password'), 'ship-test-password\n');
    env = { ...process.env, HOME: home };
    execFileSync('cast', ['wallet', 'new', join(home, '.foundry', 'keystores'), 'shipper', '--unsafe-password', 'ship-test-password'], { env, encoding: 'utf8' });
    deployer = execFileSync('cast', ['wallet', 'address', '--account', 'shipper', '--password-file', join(home, 'password')], { env, encoding: 'utf8' }).match(/0x[0-9a-fA-F]{40}/)[0];
    await allow(anvil, mocks.permission, deployer);
    await anvil.rpc('anvil_setBalance', [deployer, '0x' + (10n ** 22n).toString(16)]);
    safe2 = await deploySafe(anvil, { owners: [anvil.accounts[2], anvil.accounts[3], anvil.accounts[4]], threshold: 2, nonce: 1 });
    safe1 = await deploySafe(anvil, { owners: [anvil.accounts[2]], threshold: 1, nonce: 2 });
    project = copyKit();
  }, { timeout: 120_000 });
  after(async () => {
    await anvil.stop();
    rmSync(project, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  const opts = (extra = {}) => ({ project, chain: 151, account: 'shipper', passwordFile: join(home, 'password'), rpc: anvil.url, env, ...extra });

  test('every check passes: the report is written with the header, the checks, the readings and the gas', { timeout: 600_000 }, async () => {
    assert.ok(findGatedSuites(project).length >= 2, 'the kit has five-state suites');
    const r = await runShip(opts({ admin: safe2, verifier: mocks.permission }));
    assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => c.status === 'fail'), null, 2));
    assert.equal(r.written, shipReportPath(project, 151));
    assert.equal(r.date, utcDate());
    assert.ok(existsSync(r.written));
    const ids = r.checks.map((c) => c.id);
    for (const id of ['gas', 'chain-id', 'deployer-verified', 'admin-safe', 'compiler-pins', 'git-secrets', 'balance', 'slither-report', 'verifier', 'tests', 'five-state-tests']) assert.ok(ids.includes(id), id);
    assert.equal(r.deployer.address.toLowerCase(), deployer.toLowerCase());
    assert.equal(r.deployer.isAllowed, true);
    assert.equal(r.deployer.wellKnownDevAccount, false);
    assert.match(r.deployer.how, /^cast wallet address --account shipper/);
    assert.equal(r.admin.address, safe2);
    assert.equal(r.admin.threshold, 2);
    assert.equal(r.admin.singletonKind, 'safeSingleton');
    assert.equal(r.admin.singletonCodeMatches, true);
    assert.deepEqual(r.admin.owners.map((o) => o.toLowerCase()), [anvil.accounts[2], anvil.accounts[3], anvil.accounts[4]].map((o) => o.toLowerCase()));
    assert.equal(typeof r.admin.isAllowed, 'boolean');
    assert.equal(r.verifier.address, mocks.permission);
    assert.equal(r.verifier.isContract, true);
    assert.equal(r.tests.fiveState, true);
    assert.ok(r.tests.passed >= 40 && r.tests.failed === 0, `${r.tests.passed} passed, ${r.tests.failed} failed`);
    assert.equal(r.gas.deployment.contract, 'GatedERC20');
    assert.ok(r.gas.deployment.gas > 1_000_000n);
    assert.equal(r.gas.quote.usdPerRbnt, 0.002431);
    // The balance check priced the measured deployment gas, not the 3,000,000 default.
    assert.equal(r.preflight.checks.find((c) => c.id === 'balance').data.gas, r.gas.deployment.gas.toString());
    assert.deepEqual(r.contracts, [], 'no deployment record yet');
    assert.equal(r.pins.solc, '0.8.30');
    assert.match(r.commit, /^[0-9a-f]{40}$/);

    const md = readFileSync(r.written, 'utf8');
    const header = parseShipHeader(md);
    assert.deepEqual({ chain: header.chain, date: header.date, ok: header.ok }, { chain: 151, date: r.date, ok: true });
    assert.match(md, /^# Ship report: chain 151 \(mainnet\), \d{4}-\d{2}-\d{2}$/m);
    assert.match(md, /^\| `five-state-tests` \| pass \| /m);
    assert.match(md, new RegExp(`^Deployer ${deployer}: \`permission.isAllowed\` true\\.$`, 'mi'));
    assert.match(md, new RegExp(`^Admin ${safe2}: a contract on a canonical Safe 1\\.4\\.1 singleton \\(code matches the 1\\.4\\.1 release\\), threshold 2, 3 owners: `, 'm'));
    assert.match(md, /^No deployment record for chain 151 under `deployments\/` yet\./m);
    assert.match(md, /^Deployment of GatedERC20: [\d,]+ gas = [\d.]+ RBNT = [\d.]+ US cents\./m);
    assert.match(md, /^\| `GatedERC20:transfer\(address,uint256\)` \| [\d,]+ \| [\d.]+ \| [\d.]+ \|$/m);
    assert.match(md, /^Slither: pass\. /m);
    assert.match(md, /^## What this report does not prove$/m);
    assert.ok(!md.includes('!') || md.startsWith('<!--'), 'no exclamation mark outside the header');
    assert.ok(!/—/.test(md), 'no em dash');
    assert.ok(!/0x[0-9a-fA-F]{64}/.test(md), 'nothing key-shaped');
  });

  test('a deployment record fills in the contract, the constructor arguments and the verify command', { timeout: 600_000 }, async () => {
    const args = '0x' + '00'.repeat(31) + '12';
    mkdirSync(join(project, 'deployments'), { recursive: true });
    writeFileSync(join(project, 'deployments', '151-GatedERC20.json'), JSON.stringify({ chainId: 151, contractName: 'GatedERC20', contract: '0x00000000000000000000000000000000000000c0', deployer, admin: safe2, verifier: mocks.permission, requestId: 18, constructorSignature: 'constructor(string,string,(address,address,address,address),address,uint64,uint256)', constructorArgs: args }));
    const r = await runShip(opts({ admin: safe2, verifier: mocks.permission }));
    assert.equal(r.ok, true);
    assert.equal(r.contracts.length, 1);
    assert.equal(r.contracts[0].address, '0x00000000000000000000000000000000000000c0');
    assert.equal(r.contracts[0].constructorArgs, args);
    assert.match(r.contracts[0].verifyCommand, /^forge verify-contract 0x0{38}c0 src\/GatedERC20\.sol:GatedERC20 --verifier etherscan --verifier-url https:\/\/api\.routescan\.io\/v2\/network\/mainnet\/evm\/151\/etherscan --etherscan-api-key verifyContract --chain 151 --compiler-version 0\.8\.30 --evm-version prague --num-of-optimizations 200 --constructor-args 0x0{62}12 --watch$/);
    const md = readFileSync(r.written, 'utf8');
    assert.match(md, /^### GatedERC20 at 0x0{38}c0$/m);
    assert.match(md, /request id 18\. Explorer: https:\/\/redbelly\.routescan\.io\/address\/0x0{38}c0\/contract\/151\/code$/m);
    rmSync(join(project, 'deployments', '151-GatedERC20.json'));
  });

  test('a Safe at threshold 1 refuses: nothing written, the failing checks named, exit 1 from the CLI', { timeout: 600_000 }, async () => {
    rmSync(shipReportPath(project, 151), { force: true });
    const r = await runShip(opts({ admin: safe1, verifier: mocks.permission }));
    assert.equal(r.ok, false);
    assert.equal(r.written, null);
    assert.ok(!existsSync(shipReportPath(project, 151)), 'refused to write');
    assert.deepEqual(r.checks.filter((c) => c.status === 'fail').map((c) => c.id), ['admin-safe']);
    assert.match(r.checks.find((c) => c.id === 'admin-safe').reason, /threshold 1/);
    const cli = spawnSync(process.execPath, [redbelly, 'ship', '--project', project, '--chain', '151', '--account', 'shipper', '--password-file', join(home, 'password'), '--admin', safe1, '--verifier', mocks.permission, '--rpc', anvil.url], { encoding: 'utf8', env });
    assert.equal(cli.status, 1, cli.stderr);
    assert.match(cli.stdout, /^fail  admin-safe/m);
    assert.match(cli.stdout, /^not ok: 1 check failed \(admin-safe\)\. No report written; the deploy script refuses 151 without one\./m);
    assert.ok(!existsSync(shipReportPath(project, 151)));
  });

  test('151 without an admin or a verifier fails those two checks and writes nothing', { timeout: 600_000 }, async () => {
    const r = await runShip(opts());
    assert.equal(r.ok, false);
    const fails = r.checks.filter((c) => c.status === 'fail').map((c) => c.id).sort();
    assert.ok(fails.includes('admin-required') && fails.includes('verifier'), fails.join(', '));
    assert.equal(r.written, null);
  });

  test('the CLI refuses bad arguments with exit 2 and never echoes a key-shaped value', () => {
    const noChain = spawnSync(process.execPath, [redbelly, 'ship', '--account', 'shipper'], { encoding: 'utf8' });
    assert.equal(noChain.status, 2);
    assert.match(noChain.stderr, /--chain 151 or 153 is required/);
    const noAccount = spawnSync(process.execPath, [redbelly, 'ship', '--chain', '151'], { encoding: 'utf8' });
    assert.equal(noAccount.status, 2);
    assert.match(noAccount.stderr, /--account <keystore-name> is required/);
    const key = spawnSync(process.execPath, [redbelly, 'ship', '--chain', '151', '--account', 'x', 'ab'.repeat(32)], { encoding: 'utf8' });
    assert.equal(key.status, 2);
    assert.match(key.stderr, /looks like a private key/);
    assert.ok(!key.stderr.includes('ab'.repeat(32)));
    const help = spawnSync(process.execPath, [redbelly, 'ship', '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /^redbelly ship --chain <151\|153> --account <keystore-name>/);
  });
});

describe('redbelly ship on a local chain 153', { skip: hasFoundry ? false : 'forge, cast and anvil are needed' }, () => {
  let anvil, mocks, home, deployer, project, env;
  before(async () => {
    anvil = await startAnvil(153);
    mocks = await installRedbellyMocks(anvil);
    await anvil.rpc('anvil_setNextBlockBaseFeePerGas', ['0x' + (202_118n * 10n ** 9n).toString(16)]);
    await anvil.rpc('evm_mine', []);
    home = mkdtempSync(join(tmpdir(), 'ship-home-'));
    mkdirSync(join(home, '.foundry', 'keystores'), { recursive: true });
    writeFileSync(join(home, 'password'), 'ship-test-password\n');
    env = { ...process.env, HOME: home };
    execFileSync('cast', ['wallet', 'new', join(home, '.foundry', 'keystores'), 'shipper', '--unsafe-password', 'ship-test-password'], { env, encoding: 'utf8' });
    deployer = execFileSync('cast', ['wallet', 'address', '--account', 'shipper', '--password-file', join(home, 'password')], { env, encoding: 'utf8' }).match(/0x[0-9a-fA-F]{40}/)[0];
    await allow(anvil, mocks.permission, deployer);
    await anvil.rpc('anvil_setBalance', [deployer, '0x' + (10n ** 22n).toString(16)]);
    project = copyKit();
  }, { timeout: 120_000 });
  after(async () => {
    await anvil.stop();
    rmSync(project, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  // Audit 2026-09-19, R6. On 153 a missing admin is a skip and a missing verifier a warning, so this
  // run passes; with --out it used to land at the filename the mainnet gate looks for.
  test('--out cannot put a testnet report at the mainnet gate\'s filename', { timeout: 600_000 }, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const gate = join('deployments', `ship-151-${today}.md`);
    const cli = spawnSync(process.execPath, [redbelly, 'ship', '--project', project, '--chain', '153', '--account', 'shipper', '--password-file', join(home, 'password'), '--rpc', anvil.url, '--out', gate],
      { encoding: 'utf8', env, timeout: 540_000 });
    assert.equal(cli.status, 2, cli.stdout.slice(-1500) + cli.stderr);
    assert.match(cli.stderr, /--out names a ship report for chain 151, and this run is for chain 153/);
    assert.equal(existsSync(join(project, gate)), false, 'nothing was written at the mainnet gate\'s path');
  });

  test('testnet without an admin or a verifier writes the report with warnings, and --json carries it', { timeout: 600_000 }, async () => {
    const cli = spawnSync(process.execPath, [redbelly, 'ship', '--project', project, '--chain', '153', '--account', 'shipper', '--password-file', join(home, 'password'), '--rpc', anvil.url, '--json'], { encoding: 'utf8', env });
    assert.equal(cli.status, 0, cli.stderr + cli.stdout.slice(-2000));
    const r = JSON.parse(cli.stdout);
    assert.equal(r.ok, true);
    assert.equal(r.written, shipReportPath(project, 153));
    assert.equal(r.checks.find((c) => c.id === 'verifier').status, 'warn');
    assert.equal(r.checks.find((c) => c.id === 'admin-safe').status, 'skip');
    assert.equal(r.admin, null);
    assert.equal(typeof r.gas.deployment.gas, 'string');
    const md = readFileSync(r.written, 'utf8');
    assert.match(md, /^# Ship report: chain 153 \(testnet\), /m);
    assert.match(md, /^Admin: none given; on 153 the deployer holds every role\.$/m);
    assert.match(md, /^Verifier: none; the deploy script deploys a ReceptorMock on 153\. Request id the deploy script's default/m);
  });
});
