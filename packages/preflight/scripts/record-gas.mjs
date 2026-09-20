// Records `redbelly gas` for real: a fresh gated-erc20 scaffold, `forge snapshot` for its
// .gas-snapshot, then the report priced read-only against the real testnet (153) and the real
// mainnet (151) feeds, plus the forge gas-report path on testnet. Two RPC reads per chain and
// nothing else; no key, nothing signed. Writes reports/gas-<chain>-<date>.md.
//
//   node scripts/record-gas.mjs [--date 2026-09-14]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const redbelly = join(pkgRoot, 'dist', 'redbelly.js');
const scaffolder = resolve(pkgRoot, '..', 'create-redbelly-dapp', 'bin', 'index.js');
const args = process.argv.slice(2);
const date = args.includes('--date') ? args[args.indexOf('--date') + 1] : new Date().toISOString().slice(0, 10);
const tmp = mkdtempSync(join(tmpdir(), 'record-gas-'));
const app = join(tmp, 'my-app');
const mask = (s) => String(s).replace(new RegExp(tmp, 'g'), '<tmp>');

function run(cmd, cmdArgs, opts = {}) {
  const t = Date.now();
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '', ms: Date.now() - t };
}
function must(cmd, cmdArgs, opts) {
  const r = run(cmd, cmdArgs, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} exited ${r.code}:\n${r.out.slice(-3000)}`);
  return r;
}

console.log('scaffolding');
must(process.execPath, [scaffolder, app, '--yes', '--no-web']);
console.log('contracts:install');
must('npm', ['run', 'contracts:install', '--silent'], { cwd: app });
console.log('forge snapshot');
const snap = must('forge', ['snapshot'], { cwd: join(app, 'contracts') });
const snapshot = readFileSync(join(app, 'contracts', '.gas-snapshot'), 'utf8');

for (const chain of [153, 151]) {
  console.log(`redbelly gas --chain ${chain}`);
  const text = must(process.execPath, [redbelly, 'gas', '--project', app, '--chain', String(chain)]);
  const json = JSON.parse(must(process.execPath, [redbelly, 'gas', '--project', app, '--chain', String(chain), '--json']).stdout);
  let report = null;
  if (chain === 153) {
    console.log('redbelly gas --report (forge test --gas-report --json)');
    report = must(process.execPath, [redbelly, 'gas', '--project', app, '--chain', '153', '--report']);
  }
  const q = json.quote;
  const deploy = json.rows.find((r) => r.item === 'deployment');
  const md = `# redbelly gas against ${q.network} (${chain}), ${date}

Read-only. Two RPC reads on ${q.rpc} (the latest block's base fee and the price feed's \`getLatestPrice\`),
nothing signed, no key anywhere. The project is a fresh \`create-redbelly-dapp\` scaffold (gated-erc20,
\`--no-web\`) with \`forge snapshot\` run once in \`contracts/\`; the snapshot has one line per test, so the
first table prices tests.${report ? ' The second table is the forge gas report, one row per function of `GatedERC20`.' : ''}

Quote at block ${q.block.toLocaleString('en-US')}: base fee ${(Number(q.baseFeeWei) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })} gwei,
RBNT US$${q.usdPerRbnt} on the feed at ${q.priceFeed} (timestamp ${q.priceTimestamp}).
21,000 gas, a plain transfer, comes to ${(Number(q.baseFeeWei) * 21000 * q.usdPerRbnt / 1e18 * 100).toFixed(3)} US cents at this quote.

## \`forge snapshot\` (${snap.ms} ms)

\`\`\`
$ cd contracts && forge snapshot
${mask(snap.out).trim().split('\n').filter((l) => /Ran \d+ test suites|tests passed/.test(l)).join('\n')}
\`\`\`

## \`redbelly gas --project my-app --chain ${chain}\` (${text.ms} ms)

\`\`\`
${mask(text.stdout).trim()}
\`\`\`
${report ? `
## \`redbelly gas --project my-app --chain 153 --report\` (${report.ms} ms, includes the forge run)

\`\`\`
${mask(report.stdout).trim()}
\`\`\`
` : ''}
## The snapshot priced above

\`\`\`
${snapshot.trim()}
\`\`\`

## Headline

${deploy ? `Deployment of GatedERC20: ${Number(deploy.gas).toLocaleString('en-US')} gas = ${Number(deploy.rbnt).toFixed(4)} RBNT = ${deploy.cents.toFixed(2)} US cents.` : `The largest test, ${json.rows.slice().sort((a, b) => Number(b.gas) - Number(a.gas))[0].name}: ${Number(json.rows.slice().sort((a, b) => Number(b.gas) - Number(a.gas))[0].gas).toLocaleString('en-US')} gas = ${json.rows.slice().sort((a, b) => Number(b.gas) - Number(a.gas))[0].cents.toFixed(2)} US cents.`}
Gas is priced in US dollars on this chain and converted to RBNT at execution, so the cents column is the
stable one; the RBNT column moves with the feed. \`--json\` carries the same rows with wei as strings.
`;
  writeFileSync(join(pkgRoot, 'reports', `gas-${chain}-${date}.md`), md);
  console.log(`wrote reports/gas-${chain}-${date}.md`);
}
rmSync(tmp, { recursive: true, force: true });
