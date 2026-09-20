// redbelly ship: the mainnet gate that produces the document you wanted anyway (PLAN.md 18.3). Runs
// pre-flight with the keystore's address, checks the Slither sidecar, runs the tests and the
// five-state suites, prices the gas report on the chosen chain, reads the deployer and the admin
// (isAllowed, Safe version, threshold, owners), and writes deployments/ship-<chain>-<date>.md with
// every check and its result, the addresses, the constructor arguments and the verify command. It
// refuses to write when any check fails; the deploy script refuses to broadcast on 151 without a
// report dated today. Nothing here signs: the account name resolves to an address through cast,
// the RPC is read, forge runs tests on the local machine.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, relative, resolve } from 'node:path';
import { chainById, decodeWords, ethCall, isAllowed, toCaller } from '@gatedpath/chains';
import { readProjectConfig } from './config.js';
import { readDotEnv } from './dotenv.js';
import { readAdmin } from './checks/admin.js';
import type { AdminReading } from './checks/admin.js';
import { parseGasReportJson, priceRows, quoteGas } from './gas.js';
import type { GasQuote, PricedRow } from './gas.js';
import { run } from './proc.js';
import { DEFAULT_GAS, runPreflight } from './run.js';
import { findGatedSuites, summariseTests } from './suites.js';
import type { ForgeTestJson, SuiteSummary } from './suites.js';
import type { CheckResult, CheckStatus, PreflightReport } from './types.js';

const require = createRequire(import.meta.url);
export const SHIP_VERSION: string = (require('../package.json') as { version: string }).version;

export interface ShipOptions {
  /** Foundry project or scaffold root (its contracts/ is used). Default: cwd. */
  project?: string;
  chain: 151 | 153;
  /** Foundry keystore name; cast resolves the address, nothing else is read from it. */
  account: string;
  passwordFile?: string;
  /** The Safe that receives every role. Required on 151; ADMIN_SAFE in .env fills it in. */
  admin?: string;
  /** Deployment gas for the balance check. Default: the gas report's deployment row, then 3,000,000. */
  gas?: number | bigint;
  rpc?: string;
  /** The dApp's verifier. Required on 151; VERIFIER in .env fills it in. */
  verifier?: string;
  /** Where to write. Default: deployments/ship-<chain>-<date>.md under the Foundry project. */
  out?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ShipCheck {
  readonly id: string;
  readonly status: CheckStatus;
  readonly reason: string;
  readonly data?: Record<string, unknown>;
}

export interface ShipContract {
  readonly name: string;
  readonly address: string;
  readonly record: string;
  readonly deployer: string | null;
  readonly admin: string | null;
  readonly verifier: string | null;
  readonly requestId: string | null;
  readonly constructorSignature: string | null;
  readonly constructorArgs: string | null;
  readonly verifyCommand: string;
  readonly explorer: string;
}

export interface ShipReport {
  readonly tool: 'redbelly-ship';
  readonly version: string;
  readonly generatedAt: string;
  /** UTC date the report is dated; the deploy script wants today's. */
  readonly date: string;
  readonly project: string;
  readonly chain: 151 | 153;
  readonly network: 'mainnet' | 'testnet';
  readonly rpc: string;
  readonly ok: boolean;
  /** The file written, or null when a check failed. */
  readonly written: string | null;
  readonly checks: readonly ShipCheck[];
  readonly preflight: PreflightReport;
  readonly deployer: { readonly address: string | null; readonly how: string; readonly isAllowed: boolean | null; readonly wellKnownDevAccount: boolean };
  readonly admin: (AdminReading & { readonly isAllowed: boolean | null; readonly owners: readonly string[] | null }) | null;
  readonly verifier: { readonly address: string | null; readonly isContract: boolean | null; readonly source: string };
  readonly requestId: string | null;
  readonly tests: SuiteSummary | null;
  readonly gas: { readonly quote: GasQuote; readonly deployment: PricedRow | null; readonly rows: readonly PricedRow[] } | null;
  readonly contracts: readonly ShipContract[];
  readonly pins: { readonly solc: string | null; readonly evm: string | null; readonly runs: number | null };
  readonly forgeVersion: string | null;
  readonly commit: string | null;
}

const GET_OWNERS = '0xa0e67e2b'; // getOwners()

export function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function shipReportPath(dir: string, chain: 151 | 153, date = utcDate()): string {
  return join(dir, 'deployments', `ship-${chain}-${date}.md`);
}

/** The header every generated report starts with, and what `status` and the tests read back. */
export const SHIP_HEADER = /^<!-- redbelly-ship chain=(\d+) date=(\d{4}-\d{2}-\d{2}) ok=(true|false) generatedAt=(\S+) -->/;

export function parseShipHeader(text: string): { chain: number; date: string; ok: boolean; generatedAt: string } | null {
  const m = SHIP_HEADER.exec(text);
  return m ? { chain: Number(m[1]), date: m[2]!, ok: m[3] === 'true', generatedAt: m[4]! } : null;
}

async function safeOwners(rpc: string, safe: string): Promise<string[] | null> {
  try {
    const ret = await ethCall(rpc, safe, GET_OWNERS);
    const words = decodeWords(ret);
    const len = Number(words[1] ?? 0n);
    return words.slice(2, 2 + len).map((w) => `0x${w.toString(16).padStart(64, '0').slice(24)}`);
  } catch {
    return null;
  }
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);

export function routescanBase(chain: 151 | 153): { verifier: string; explorer: string } {
  return chain === 151
    ? { verifier: 'https://api.routescan.io/v2/network/mainnet/evm/151/etherscan', explorer: 'https://redbelly.routescan.io' }
    : { verifier: 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan', explorer: 'https://redbelly.testnet.routescan.io' };
}

/** The deployment records the deploy script wrote for this chain, with the verify command each needs. */
export function readShipContracts(dir: string, chain: 151 | 153, pins: ShipReport['pins']): ShipContract[] {
  const dep = join(dir, 'deployments');
  if (!existsSync(dep)) return [];
  const out: ShipContract[] = [];
  for (const name of readdirSync(dep).sort()) {
    if (!(name === `${chain}.json` || (name.startsWith(`${chain}-`) && name.endsWith('.json')))) continue;
    const record = readJson(join(dep, name));
    const address = str(record?.['contract']);
    if (!record || !address) continue;
    const contractName = str(record['contractName']) ?? basename(name, '.json').replace(new RegExp(`^${chain}-`), '');
    const sig = str(record['constructorSignature']);
    const args = str(record['constructorArgs']);
    const rs = routescanBase(chain);
    const verifyCommand = `forge verify-contract ${address} src/${contractName}.sol:${contractName} --verifier etherscan --verifier-url ${rs.verifier} --etherscan-api-key verifyContract --chain ${chain} --compiler-version ${pins.solc ?? '0.8.30'} --evm-version ${pins.evm ?? 'prague'}${pins.runs !== null ? ` --num-of-optimizations ${pins.runs}` : ''} --constructor-args ${args ?? '<cast abi-encode output>'} --watch`;
    out.push({
      name: contractName,
      address,
      record: join(dep, name),
      deployer: str(record['deployer']),
      admin: str(record['admin']),
      verifier: str(record['verifier']),
      requestId: str(record['requestId']),
      constructorSignature: sig,
      constructorArgs: args,
      verifyCommand,
      explorer: `${rs.explorer}/address/${address}/contract/${chain}/code`,
    });
  }
  return out;
}

export async function runShip(opts: ShipOptions): Promise<ShipReport> {
  const env = opts.env ?? process.env;
  const project = resolve(opts.project ?? process.cwd());
  const dir = !existsSync(join(project, 'foundry.toml')) && existsSync(join(project, 'contracts', 'foundry.toml')) ? join(project, 'contracts') : project;
  if (!existsSync(join(dir, 'foundry.toml'))) throw new Error(`no foundry.toml in ${project} or ${join(project, 'contracts')}; ship drives forge and reads the Foundry project`);
  const chain = opts.chain;
  if (opts.out) refuseAnotherChainsName(resolve(dir, opts.out), chain); // before any work: this is a usage mistake
  const network = chain === 151 ? 'mainnet' : 'testnet';
  const dotenv = readDotEnv(dir, env);
  const rootEnv = dir === project ? dotenv : { ...readDotEnv(project, env), ...dotenv };
  const rpc = opts.rpc ?? chainById(chain)!.rpcUrls.default.http[0]!;
  const config = readProjectConfig(dir, undefined, env);
  const pins = { solc: config.solc, evm: config.evmVersion, runs: config.optimizerRuns };
  const checks: ShipCheck[] = [];

  // forge, and the project's commit, for the record
  const fv = await run('forge', ['--version'], { cwd: dir, timeoutMs: 20_000 });
  const forgeVersion = fv.spawnError ? null : (/(\d+\.\d+\.\d+)/.exec(fv.stdout + fv.stderr)?.[1] ?? null);
  const git = await run('git', ['rev-parse', 'HEAD'], { cwd: dir, timeoutMs: 20_000 });
  const commit = git.code === 0 ? git.stdout.trim() : null;

  // 1. gas report first: it gives the deployment figure the balance check prices
  let gas: ShipReport['gas'] = null;
  let quote: GasQuote | null = null;
  try {
    quote = await quoteGas(rpc, chain);
  } catch (e) {
    checks.push({ id: 'gas', status: 'fail', reason: `Could not read the base fee and feed price from ${rpc}: ${(e as Error).message}.` });
  }
  const gr = forgeVersion ? await run('forge', ['test', '--gas-report', '--json'], { cwd: dir, env, timeoutMs: 900_000 }) : null;
  let deploymentGas: bigint | null = null;
  if (gr && quote) {
    const start = gr.stdout.indexOf('[');
    let rows: ReturnType<typeof parseGasReportJson> = [];
    if (gr.code === 0 && start >= 0) {
      try {
        rows = parseGasReportJson(JSON.parse(gr.stdout.slice(start)));
      } catch {
        rows = [];
      }
    }
    if (rows.length === 0) {
      checks.push({ id: 'gas', status: gr.code === 0 ? 'warn' : 'fail', reason: gr.code === 0 ? 'forge test --gas-report --json listed no contract; set gas_reports in foundry.toml so the report can price the deployment.' : `forge test --gas-report --json exited ${gr.code}: ${(gr.stderr || gr.stdout).trim().slice(-400)}` });
    } else {
      const priced = priceRows(rows, quote).rows;
      const deployment = priced.find((r) => r.item === 'deployment') ?? null;
      deploymentGas = deployment?.gas ?? null;
      gas = { quote, deployment, rows: priced };
      checks.push({ id: 'gas', status: 'pass', reason: `${priced.length} rows priced at block ${quote.block.toLocaleString('en-US')}: base fee ${(Number(quote.baseFeeWei) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })} gwei, RBNT US$${quote.usdPerRbnt}${deployment ? `; ${deployment.contract} deploys for ${deployment.gas.toLocaleString('en-US')} gas = ${Number(deployment.rbnt).toFixed(4)} RBNT = ${deployment.cents.toFixed(2)} US cents` : ''}.`, data: { block: quote.block, baseFeeWei: quote.baseFeeWei.toString(), usdPerRbnt: quote.usdPerRbnt, deploymentGas: deploymentGas?.toString() ?? null } });
    }
  } else if (!forgeVersion) {
    checks.push({ id: 'gas', status: 'fail', reason: 'forge is not installed or not on PATH; run redbelly-doctor.' });
  }

  // 2. pre-flight, seven checks, with the keystore's address and the measured deployment gas
  const gasForBalance = opts.gas !== undefined ? BigInt(opts.gas) : (deploymentGas ?? DEFAULT_GAS);
  const admin = opts.admin ?? rootEnv['ADMIN_SAFE'];
  const preflight = await runPreflight({ project: dir, chain, rpc, account: opts.account, ...(opts.passwordFile ? { passwordFile: opts.passwordFile } : {}), ...(admin ? { admin } : {}), gas: gasForBalance, env });
  for (const c of preflight.checks) checks.push({ id: c.id, status: c.status, reason: c.reason, ...(c.data ? { data: c.data } : {}) });
  if (chain === 151 && !admin) checks.push({ id: 'admin-required', status: 'fail', reason: 'Chain 151 needs --admin <safe> (or ADMIN_SAFE in .env): the Safe 1.4.1 that receives every role.' });

  // 3. the verifier the deploy script will bind
  const verifierAddr = opts.verifier ?? rootEnv['VERIFIER'] ?? null;
  const verifierSource = opts.verifier ? '--verifier' : rootEnv['VERIFIER'] ? 'VERIFIER in .env' : 'none';
  let verifierIsContract: boolean | null = null;
  if (verifierAddr) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(verifierAddr)) checks.push({ id: 'verifier', status: 'fail', reason: `${verifierSource} is not a 20-byte hex address.` });
    else {
      try {
        const code = (await toCaller(rpc)('eth_getCode', [verifierAddr, 'latest'])) as string;
        verifierIsContract = code !== '0x' && code.length > 2;
      } catch {
        verifierIsContract = null;
      }
      if (verifierIsContract) checks.push({ id: 'verifier', status: 'pass', reason: `${verifierAddr} (${verifierSource}) has code on chain ${chain}.`, data: { address: verifierAddr } });
      else checks.push({ id: 'verifier', status: 'fail', reason: `${verifierAddr} (${verifierSource}) has no code on chain ${chain}; the deploy script requires a contract.`, data: { address: verifierAddr } });
    }
  } else if (chain === 151) checks.push({ id: 'verifier', status: 'fail', reason: 'No VERIFIER: mainnet never deploys a mock verifier. Set VERIFIER in .env or pass --verifier.' });
  else checks.push({ id: 'verifier', status: 'warn', reason: 'No VERIFIER: the deploy script will deploy a ReceptorMock on 153 and every wallet starts ineligible. Fine for testnet; mainnet refuses.' });
  const requestId = rootEnv['REQUEST_ID'] ?? null;

  // 4. tests and the five-state suites
  let tests: SuiteSummary | null = null;
  if (forgeVersion) {
    const suites = findGatedSuites(dir);
    const t = await run('forge', ['test', '--json'], { cwd: dir, env, timeoutMs: 900_000 });
    let parsed: ForgeTestJson | null = null;
    try {
      parsed = JSON.parse(t.stdout) as ForgeTestJson;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      checks.push({ id: 'tests', status: 'fail', reason: `forge test did not print JSON (exit ${t.code}): ${(t.stderr || t.stdout).trim().slice(-400)}` });
      checks.push({ id: 'five-state-tests', status: 'fail', reason: 'Not run: forge test failed above.' });
    } else {
      tests = summariseTests(parsed, suites);
      checks.push(tests.failed === 0 && tests.passed > 0 ? { id: 'tests', status: 'pass', reason: `${tests.passed} passed, ${tests.failed} failed${tests.skipped ? `, ${tests.skipped} skipped` : ''}.`, data: { passed: tests.passed, failed: tests.failed } } : { id: 'tests', status: 'fail', reason: tests.passed === 0 ? 'No test ran.' : `${tests.failed} failed: ${tests.failures.slice(0, 3).map((f) => `${f.suite}.${f.test}`).join(', ')}${tests.failures.length > 3 ? ', …' : ''}.`, data: { passed: tests.passed, failed: tests.failed, failures: tests.failures } });
      checks.push(
        tests.fiveState
          ? { id: 'five-state-tests', status: 'pass', reason: `${suites.length} suite${suites.length === 1 ? '' : 's'} inherit GatedTest and pass: ${tests.suites.map((s) => `${s.name} (${s.passed})`).join(', ')}.`, data: { suites: tests.suites } }
          : { id: 'five-state-tests', status: 'fail', reason: suites.length === 0 ? 'No test contract inherits GatedTest; every gated function needs a suite proven against all five credential states.' : `A GatedTest suite failed or ran nothing: ${tests.suites.filter((s) => s.failed > 0 || s.passed === 0).map((s) => `${s.name} (${s.passed} passed, ${s.failed} failed)`).join(', ')}.`, data: { suites: tests.suites } },
      );
    }
  } else {
    checks.push({ id: 'tests', status: 'fail', reason: 'forge is not installed or not on PATH.' });
    checks.push({ id: 'five-state-tests', status: 'fail', reason: 'Not run: forge missing.' });
  }

  // 5. the readings the report carries: deployer and admin on this chain
  const deployerCheck = preflight.checks.find((c) => c.id === 'deployer-verified');
  const deployer = {
    address: preflight.deployer,
    how: (deployerCheck?.data?.['how'] as string | undefined) ?? (opts.account ? `cast wallet address --account ${opts.account}` : 'none'),
    isAllowed: typeof deployerCheck?.data?.['allowed'] === 'boolean' ? (deployerCheck.data['allowed'] as boolean) : null,
    wellKnownDevAccount: deployerCheck?.data?.['wellKnownDevAccount'] === true,
  };
  let adminReading: ShipReport['admin'] = null;
  if (admin && /^0x[0-9a-fA-F]{40}$/.test(admin)) {
    try {
      const reading = await readAdmin(admin, rpc, network);
      let allowed: boolean | null = null;
      try {
        allowed = await isAllowed(admin, { rpc });
      } catch {
        allowed = null;
      }
      adminReading = { ...reading, isAllowed: allowed, owners: reading.isContract ? await safeOwners(rpc, admin) : null };
    } catch {
      adminReading = null;
    }
  }

  const contracts = readShipContracts(dir, chain, pins);
  const ok = checks.every((c) => c.status !== 'fail');
  const date = utcDate();
  const out = opts.out ? resolve(dir, opts.out) : shipReportPath(dir, chain, date);
  const report: ShipReport = {
    tool: 'redbelly-ship',
    version: SHIP_VERSION,
    generatedAt: new Date().toISOString(),
    date,
    project: dir,
    chain,
    network,
    rpc,
    ok,
    written: null,
    checks,
    preflight,
    deployer,
    admin: adminReading,
    verifier: { address: verifierAddr, isContract: verifierIsContract, source: verifierSource },
    requestId,
    tests,
    gas,
    contracts,
    pins,
    forgeVersion,
    commit,
  };
  if (!ok) return report;
  mkdirSync(join(dir, 'deployments'), { recursive: true });
  writeFileSync(out, renderShipMarkdown(report));
  return { ...report, written: out };
}

/**
 * The deploy scripts find today's report by its name, `ship-<chain>-<date>.md`. `--out` may put the
 * report anywhere, except under a name that says it is for a different chain: a passing testnet
 * report must never sit where the mainnet gate looks (audit of 2026-09-19).
 */
export function refuseAnotherChainsName(out: string, chain: number): void {
  const named = /^ship-(\d+)-/.exec(basename(out));
  if (named && Number(named[1]) !== chain) {
    throw new ShipUsageError(`--out names a ship report for chain ${named[1]}, and this run is for chain ${chain}. Choose another name, or leave --out off.`);
  }
}

/** A mistake in how ship was called, as opposed to a check that failed. The CLI exits 2 on it. */
export class ShipUsageError extends Error {}

// ---- the document ----

const fmt = (n: bigint | number) => n.toLocaleString('en-US');
const short = (s: string | null | undefined) => (s && s.includes('.') ? s.replace(/(\.\d{4})\d+$/, '$1') : s ?? '');

export function renderShipMarkdown(r: ShipReport): string {
  const L: string[] = [];
  const fails = r.checks.filter((c) => c.status === 'fail');
  const warns = r.checks.filter((c) => c.status === 'warn');
  L.push(`<!-- redbelly-ship chain=${r.chain} date=${r.date} ok=${r.ok} generatedAt=${r.generatedAt} -->`);
  L.push(`# Ship report: chain ${r.chain} (${r.network}), ${r.date}`);
  L.push('');
  L.push(`Written by \`redbelly ship\` ${r.version} at ${r.generatedAt} for \`${r.project}\`${r.commit ? ` at commit \`${r.commit.slice(0, 12)}\`` : ''}, read-only against ${r.rpc}. ${r.ok ? `Every check passed${warns.length ? ` with ${warns.length} warning${warns.length === 1 ? '' : 's'}` : ''}; the deploy script accepts a broadcast on chain ${r.chain} dated today with this file present.` : `${fails.length} check${fails.length === 1 ? '' : 's'} failed, so this document was not written to deployments/.`} Nothing here signs. The deployer's address came from \`${r.deployer.how}\`; the key stayed in the keystore.`);
  L.push('');
  L.push('## Checks');
  L.push('');
  L.push('| Check | Result | Reason |');
  L.push('|---|---|---|');
  for (const c of r.checks) L.push(`| \`${c.id}\` | ${c.status} | ${c.reason.replace(/\|/g, '\\|')} |`);
  L.push('');
  L.push('## Deployer and admin');
  L.push('');
  L.push(`Deployer ${r.deployer.address ?? 'unknown'}: \`permission.isAllowed\` ${r.deployer.isAllowed === null ? 'not read' : r.deployer.isAllowed}${r.deployer.wellKnownDevAccount ? ' (one of the ten Anvil default accounts, whose keys are public; never for a real network)' : ''}.`);
  if (r.admin) {
    const a = r.admin;
    L.push(`Admin ${a.address}: ${a.isContract ? `a contract on a ${a.singletonKind ? `canonical ${a.singletonKind === 'safeL2Singleton' ? 'SafeL2' : 'Safe'} 1.4.1 singleton (code ${a.singletonCodeMatches ? 'matches the 1.4.1 release' : 'does not match the 1.4.1 release'})` : 'singleton this tool does not recognise'}, threshold ${a.threshold ?? 'unreadable'}${a.owners ? `, ${a.owners.length} owner${a.owners.length === 1 ? '' : 's'}: ${a.owners.join(', ')}` : ''}` : 'an externally owned account, which chain 151 refuses'}; \`permission.isAllowed\` ${a.isAllowed === null ? 'not read' : a.isAllowed}.`);
  } else L.push(`Admin: none given${r.chain === 153 ? '; on 153 the deployer holds every role' : ''}.`);
  L.push(`Verifier: ${r.verifier.address ? `${r.verifier.address} (${r.verifier.source}), ${r.verifier.isContract === null ? 'code not read' : r.verifier.isContract ? 'has code' : 'no code'}` : r.chain === 151 ? 'none; mainnet refuses' : 'none; the deploy script deploys a ReceptorMock on 153'}. Request id ${r.requestId ?? 'the deploy script\'s default (18, the over-18 recipe)'}.`);
  L.push('');
  L.push('## Contracts');
  L.push('');
  if (r.contracts.length === 0) {
    L.push(`No deployment record for chain ${r.chain} under \`deployments/\` yet. Deploy with \`forge script script/Deploy.s.sol --rpc-url ${r.network === 'mainnet' ? 'redbelly_mainnet' : 'redbelly_testnet'} --account <keystore-name> --broadcast\`, then run \`redbelly ship\` again today: this section fills in with the address, the constructor arguments and the exact verify command.`);
  } else {
    for (const c of r.contracts) {
      L.push(`### ${c.name} at ${c.address}`);
      L.push('');
      L.push(`Record \`${relative(r.project, c.record)}\`${c.deployer ? `, deployed by ${c.deployer}` : ''}${c.admin ? `, admin ${c.admin}` : ''}${c.verifier ? `, verifier ${c.verifier}` : ''}${c.requestId ? `, request id ${c.requestId}` : ''}. Explorer: ${c.explorer}`);
      L.push('');
      if (c.constructorSignature) L.push(`Constructor \`${c.constructorSignature}\`, arguments as encoded by the deploy script:`);
      else L.push('The record carries no constructor arguments (written by an older deploy script); encode them with `cast abi-encode` for the command below.');
      L.push('');
      if (c.constructorArgs) L.push('```', c.constructorArgs, '```', '');
      L.push('Verify on Routescan:');
      L.push('');
      L.push('```sh', c.verifyCommand, '```');
      L.push('');
    }
  }
  L.push('## Gas');
  L.push('');
  if (r.gas) {
    const q = r.gas.quote;
    L.push(`Priced at block ${fmt(q.block)}: base fee ${(Number(q.baseFeeWei) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })} gwei, RBNT US$${q.usdPerRbnt} on the feed at ${q.priceFeed} (${q.priceTimestamp}). Gas is priced in US dollars on this chain and converted to RBNT at execution, so the cents column is the stable one.`);
    L.push('');
    if (r.gas.deployment) L.push(`Deployment of ${r.gas.deployment.contract}: ${fmt(r.gas.deployment.gas)} gas = ${short(r.gas.deployment.rbnt)} RBNT = ${r.gas.deployment.cents.toFixed(2)} US cents. Pre-flight's balance check used ${fmt(BigInt((r.preflight.checks.find((c) => c.id === 'balance')?.data?.['gas'] as string | undefined) ?? '0'))} gas with 25% on top.`);
    L.push('');
    L.push('| Function | Gas | RBNT | US cents |');
    L.push('|---|---:|---:|---:|');
    for (const row of r.gas.rows) L.push(`| \`${row.name}\` | ${fmt(row.gas)} | ${short(row.rbnt)} | ${row.cents.toFixed(3)} |`);
  } else L.push('Not priced; see the `gas` check above.');
  L.push('');
  L.push('## Tests');
  L.push('');
  if (r.tests) {
    L.push(`\`forge test\`: ${r.tests.passed} passed, ${r.tests.failed} failed${r.tests.skipped ? `, ${r.tests.skipped} skipped` : ''}${r.forgeVersion ? ` on forge ${r.forgeVersion}` : ''}. Five-state suites (inherit \`GatedTest\`): ${r.tests.suites.length ? r.tests.suites.map((s) => `${s.name} ${s.passed} passed, ${s.failed} failed`).join('; ') : 'none'}.`);
  } else L.push('Not run; see the `tests` check above.');
  L.push('');
  L.push('## Static analysis');
  L.push('');
  const sl = r.preflight.checks.find((c) => c.id === 'slither-report');
  L.push(sl ? `Slither: ${sl.status}. ${sl.reason}` : 'Slither: not checked.');
  L.push('');
  L.push('## Compiler');
  L.push('');
  L.push(`solc ${r.pins.solc ?? 'unknown'}, EVM ${r.pins.evm ?? 'unknown'}, optimizer runs ${r.pins.runs ?? 'unknown'}${r.forgeVersion ? `, forge ${r.forgeVersion}` : ''}. Both networks run Prague and Vine states 0.8.30.`);
  L.push('');
  L.push('## What this report does not prove');
  L.push('');
  L.push('Monitoring live (the ops kit\'s alert poller on this contract), a `security.txt` at the web app\'s root, an audit or a bug bounty, and that the Safe\'s owners are the people you think. The builder site\'s review page lists them in order; tick them by hand under this line before mainnet.');
  L.push('');
  return L.join('\n');
}

export function renderShipText(r: ShipReport): string {
  const lines: string[] = [];
  lines.push(`redbelly ship ${r.version}  project ${r.project}  chain ${r.chain} (${r.network}) via ${r.rpc}`);
  lines.push(`deployer ${r.deployer.address ?? 'unknown'} (${r.deployer.how})${r.admin ? `  admin ${r.admin.address}` : ''}${r.verifier.address ? `  verifier ${r.verifier.address}` : ''}`);
  lines.push('');
  for (const c of r.checks) lines.push(`${c.status.padEnd(5)} ${c.id.padEnd(18)} ${c.reason}`);
  lines.push('');
  const fails = r.checks.filter((c) => c.status === 'fail');
  if (r.ok) lines.push(`ok: every check passed. Report written: ${r.written}. The deploy script accepts a broadcast on ${r.chain} today with it present.`);
  else lines.push(`not ok: ${fails.length} check${fails.length === 1 ? '' : 's'} failed (${fails.map((c) => c.id).join(', ')}). No report written; the deploy script refuses 151 without one. Fix each line, then run redbelly ship again.`);
  if (r.gas?.deployment) lines.push(`gas: ${r.gas.deployment.contract} deploys for ${fmt(r.gas.deployment.gas)} gas = ${short(r.gas.deployment.rbnt)} RBNT = ${r.gas.deployment.cents.toFixed(2)} US cents at block ${fmt(r.gas.quote.block)}.`);
  return lines.join('\n') + '\n';
}

export function shipReportJson(report: ShipReport): string {
  return JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n';
}

