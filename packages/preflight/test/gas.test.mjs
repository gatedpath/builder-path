// redbelly gas: the two parsers over real forge output, the pricing arithmetic against gasCostUsd,
// a priced run on a local Anvil with the mocked feed (chain 153, price 2431 = US$0.002431 per RBNT),
// a --diff, the gas-report path through a real forge run, and the CLI's exit codes. No network, no key.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { gasCostUsd } from '@gatedpath/chains';
import { parseGasFile, parseGasReportJson, parseGasSnapshot, priceGas, priceRows, quoteGas, runGas, renderGasText, foundryDir } from '../dist/index.js';
import { installRedbellyMocks, startAnvil } from './anvil.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const redbelly = join(here, '..', 'dist', 'redbelly.js');
const receptorMock = join(here, '..', '..', 'receptor-mock');
const hasForge = spawnSync('forge', ['--version']).status === 0;

const SNAPSHOT = `AdminPatternTest:test_deployerHoldsNothing() (gas: 49204)
GatedERC20FuzzTest:testFuzz_subscribe_onlyValidOnce(address,uint8) (runs: 512, μ: 70590, ~: 55074)
GatedERC20Invariants:invariant_supplyConserved() (runs: 64, calls: 2048, reverts: 0)
GatedERC20Test:test_burn_revertsInAllInvalidStates() (gas: 194226)

not a snapshot line
`;

const REPORT = [
  { contract: 'src/GatedERC20.sol:GatedERC20', deployment: { gas: 1898391, size: 9685 }, functions: { 'transfer(address,uint256)': { calls: 10, min: 30000, mean: 41234.6, median: 41000, max: 52000 }, 'balanceOf(address)': { calls: 9810, min: 2643, mean: 2643, median: 2643, max: 2643 } } },
];

test('parseGasSnapshot: plain, fuzz by its mean, invariants skipped, junk ignored', () => {
  const rows = parseGasSnapshot(SNAPSHOT);
  assert.deepEqual(rows.map((r) => r.name), ['AdminPatternTest:test_deployerHoldsNothing()', 'GatedERC20FuzzTest:testFuzz_subscribe_onlyValidOnce(address,uint8)', 'GatedERC20Test:test_burn_revertsInAllInvalidStates()']);
  assert.equal(rows[0].gas, 49204n);
  assert.equal(rows[1].gas, 70590n);
  assert.equal(rows[1].calls, 512);
  assert.equal(rows[0].contract, 'AdminPatternTest');
  assert.equal(rows[2].item, 'test_burn_revertsInAllInvalidStates()');
  // The contract kit's committed snapshot parses to one row per non-invariant line.
  const kit = readFileSync(join(here, '..', '..', 'contract-kit', '.gas-snapshot'), 'utf8');
  const kitRows = parseGasSnapshot(kit);
  assert.equal(kitRows.length, kit.split('\n').filter((l) => /\(gas: |μ: /.test(l)).length);
});

test('parseGasReportJson: the deployment row first, then functions sorted, the contract name without its path', () => {
  const rows = parseGasReportJson(REPORT);
  assert.deepEqual(rows.map((r) => r.name), ['GatedERC20:deployment', 'GatedERC20:balanceOf(address)', 'GatedERC20:transfer(address,uint256)']);
  assert.equal(rows[0].gas, 1898391n);
  assert.equal(rows[2].gas, 41235n, 'the mean, rounded');
  assert.equal(rows[2].calls, 10);
  assert.equal(rows[2].min, 30000n);
  assert.equal(rows[2].max, 52000n);
  assert.deepEqual(parseGasReportJson({ not: 'an array' }), []);
  assert.equal(parseGasFile(JSON.stringify(REPORT)).kind, 'gas-report-file');
  assert.equal(parseGasFile(SNAPSHOT).kind, 'snapshot');
  assert.equal(parseGasFile('[not json').kind, 'snapshot', 'a bracket that is not JSON falls back to the snapshot parser');
});

test('priceGas: 21,000 gas at the recorded base fee and feed price is one US cent, in integers', () => {
  // The recorded facts: a plain transfer costs US$0.01 (RESEARCH.md); feed raw 2431 is US$0.002431 per RBNT.
  // A base fee that makes 21,000 gas exactly one cent at that price: 0.01 / 0.002431 RBNT = 4.11353 RBNT / 21000.
  const baseFeeWei = (10n ** 16n * 10n ** 18n) / (2431n * 10n ** 12n) / 21000n; // wei per gas, truncated
  const p = priceGas(21000n, { baseFeeWei, priceRaw: 2431n });
  assert.ok(Math.abs(p.cents - 1) < 0.002, `${p.cents} cents (the base fee is truncated to a whole wei)`);
  assert.ok(Math.abs(p.usd - 0.01) < 0.00001);
  assert.equal(p.wei, 21000n * baseFeeWei);
  assert.equal(priceGas(0n, { baseFeeWei, priceRaw: 2431n }).cents, 0);
  const rows = priceRows([{ name: 'A:x()', contract: 'A', item: 'x()', gas: 100n }, { name: 'A:y()', contract: 'A', item: 'y()', gas: 300n }], { baseFeeWei, priceRaw: 2431n }, [{ name: 'A:x()', contract: 'A', item: 'x()', gas: 120n }, { name: 'A:z()', contract: 'A', item: 'z()', gas: 5n }]);
  assert.deepEqual(rows.rows[0].delta.gas, -20n);
  assert.equal(rows.rows[1].delta, undefined);
  assert.deepEqual(rows.added, ['A:y()']);
  assert.deepEqual(rows.removed, ['A:z()']);
});

describe('priced against a local chain 153 with the mocked feed', () => {
  let anvil, project;
  before(async () => {
    anvil = await startAnvil(153);
    await installRedbellyMocks(anvil);
    // Anvil's default base fee is under a gwei; the real testnet's was 202,118 gwei on 14 September 2026
    // (the chain prices gas in dollars, so the wei figure is large). Set it so cents come out non-zero.
    await anvil.rpc('anvil_setNextBlockBaseFeePerGas', ['0x' + (202_118n * 10n ** 9n).toString(16)]);
    await anvil.rpc('evm_mine', []);
    project = mkdtempSync(join(tmpdir(), 'gas-'));
    mkdirSync(join(project, 'contracts'));
    writeFileSync(join(project, 'contracts', 'foundry.toml'), '[profile.default]\nsrc = "src"\n');
    writeFileSync(join(project, 'contracts', '.gas-snapshot'), SNAPSHOT);
    writeFileSync(join(project, 'before.gas-snapshot'), SNAPSHOT.replace('49204', '50000').replace('GatedERC20Test:test_burn_revertsInAllInvalidStates() (gas: 194226)', 'GatedERC20Test:test_gone() (gas: 1)'));
  });
  after(() => anvil.stop());

  test('quoteGas reads the base fee and the feed; every row agrees with gasCostUsd to the cent', async () => {
    const q = await quoteGas(anvil.url, 153);
    assert.equal(q.chain, 153);
    assert.equal(q.network, 'testnet');
    assert.equal(q.usdPerRbnt, 0.002431);
    assert.equal(q.priceRaw, 2431n);
    assert.ok(q.baseFeeWei > 0n);
    assert.match(q.priceTimestamp, /^\d{4}-\d{2}-\d{2}T/);
    for (const gas of [21000n, 1898391n]) {
      const mine = priceGas(gas, q);
      const theirs = await gasCostUsd({ gasUsed: gas, rpc: anvil.url, gasPriceWei: q.baseFeeWei });
      assert.equal(mine.wei, theirs.wei);
      assert.equal(mine.rbnt, theirs.rbnt);
      assert.ok(Math.abs(mine.usd * 100 - mine.cents) < 0.001, 'cents is usd times 100 to three places');
      assert.ok(Math.abs(mine.usd - theirs.usd) < 1e-9);
    }
    await assert.rejects(quoteGas(anvil.url, 151), /--chain 151 but the RPC .* reports 153/);
  });

  test('runGas on a scaffold root finds contracts/.gas-snapshot, prices every row, and --diff marks changes', async () => {
    assert.equal(foundryDir(project), join(project, 'contracts'));
    const r = await runGas({ project, rpc: anvil.url, chain: 153 });
    assert.equal(r.tool, 'redbelly-gas');
    assert.equal(r.source.kind, 'snapshot');
    assert.equal(r.rows.length, 3);
    assert.equal(r.diff, null);
    for (const row of r.rows) {
      assert.equal(row.wei, row.gas * r.quote.baseFeeWei);
      assert.ok(row.cents > 0);
    }
    const text = renderGasText(r);
    assert.match(text, /^redbelly gas \d+\.\d+\.\d+  project .*  source contracts\/\.gas-snapshot \(3 rows, one per test\)/);
    assert.match(text, /chain 153 \(testnet\) via http:\/\/127\.0\.0\.1:\d+  block \d+  base fee [\d,.]+ gwei  RBNT US\$0\.002431/);
    assert.match(text, /^Item\s+Gas\s+RBNT\s+US cents$/m);
    assert.match(text, /^AdminPatternTest:test_deployerHoldsNothing\(\)\s+49,204\s+[\d.]+\s+[\d.]+$/m);
    assert.ok(!text.includes('!'));

    const d = await runGas({ project, rpc: anvil.url, chain: 153, diff: '../before.gas-snapshot' });
    assert.equal(d.diff.rows, 3);
    assert.deepEqual(d.diff.added, ['GatedERC20Test:test_burn_revertsInAllInvalidStates()']);
    assert.deepEqual(d.diff.removed, ['GatedERC20Test:test_gone()']);
    const first = d.rows.find((x) => x.name === 'AdminPatternTest:test_deployerHoldsNothing()');
    assert.equal(first.delta.gas, -796n);
    assert.ok(first.delta.cents < 0);
    const dt = renderGasText(d);
    assert.match(dt, /Gas diff\s+Cents diff/);
    assert.match(dt, /-796\s+-[\d.]+$/m);
    assert.match(dt, /gone since before\.gas-snapshot: GatedERC20Test:test_gone\(\)/);
    await assert.rejects(runGas({ project, rpc: anvil.url, diff: 'nope' }), /--diff: no such file/);
    await assert.rejects(runGas({ project: mkdtempSync(join(tmpdir(), 'gas-empty-')), rpc: anvil.url }), /no \.gas-snapshot and no foundry\.toml/);
  });

  test('the gas-report path runs forge and prices the deployment and each function', { skip: hasForge ? false : 'forge is not installed' }, async () => {
    // A copy of receptor-mock (its lib/ and node_modules/ linked) with gas_reports set, so forge has contracts to report on.
    const copy = mkdtempSync(join(tmpdir(), 'gas-forge-'));
    for (const f of ['remappings.txt', 'src', 'test']) cpSync(join(receptorMock, f), join(copy, f), { recursive: true });
    for (const f of ['lib', 'node_modules']) symlinkSync(join(receptorMock, f), join(copy, f));
    writeFileSync(join(copy, 'foundry.toml'), readFileSync(join(receptorMock, 'foundry.toml'), 'utf8').replace(/gas_reports\s*=.*\n/, '') + '\ngas_reports = ["ReceptorMock"]\n');
    const r = await runGas({ project: copy, rpc: anvil.url, chain: 153, report: true });
    assert.equal(r.source.kind, 'gas-report');
    assert.equal(r.source.command, 'forge test --gas-report --json');
    assert.equal(r.rows[0].name, 'ReceptorMock:deployment');
    assert.ok(r.rows.some((x) => x.item.startsWith('setStatus(')), r.rows.map((x) => x.name).join(', '));
    assert.ok(r.rows.every((x) => x.gas > 0n && x.cents > 0));
    assert.match(renderGasText(r), /^deployment: ReceptorMock [\d,]+ gas = [\d.]+ RBNT = US\$[\d.]+[;.].*Pre-flight's balance check adds 25% on top/m);
    // Written out, the same JSON prices again as a file and matches.
    writeFileSync(join(copy, 'report.json'), JSON.stringify(REPORT));
    const again = await runGas({ project: copy, rpc: anvil.url, chain: 153, snapshot: 'report.json' });
    assert.equal(again.source.kind, 'gas-report-file');
    assert.equal(again.rows.length, 3);
  });

  test('the CLI: --json exits 0, a missing source exits 1 with the reason, a bad flag exits 2', () => {
    const ok = spawnSync(process.execPath, [redbelly, 'gas', '--project', project, '--rpc', anvil.url, '--chain', '153', '--json'], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    const j = JSON.parse(ok.stdout);
    assert.equal(j.tool, 'redbelly-gas');
    assert.equal(typeof j.rows[0].gas, 'string', 'BigInt as a decimal string');
    assert.equal(j.quote.usdPerRbnt, 0.002431);
    const none = spawnSync(process.execPath, [redbelly, 'gas', '--project', mkdtempSync(join(tmpdir(), 'gas-none-')), '--rpc', anvil.url], { encoding: 'utf8' });
    assert.equal(none.status, 1);
    assert.match(none.stderr, /^redbelly gas: no \.gas-snapshot and no foundry\.toml/);
    const bad = spawnSync(process.execPath, [redbelly, 'gas', '--chain', '1'], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /--chain must be 151 or 153/);
    const key = spawnSync(process.execPath, [redbelly, 'gas', 'ab'.repeat(32)], { encoding: 'utf8' });
    assert.equal(key.status, 2);
    assert.match(key.stderr, /looks like a private key/);
    const help = spawnSync(process.execPath, [redbelly, 'gas', '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /^redbelly gas \[options\]/);
  });
});
