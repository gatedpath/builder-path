// redbelly gas: a gas report in the unit the chain charges in. Reads `.gas-snapshot` (one line per
// test) or `forge test --gas-report --json` (deployment and every function of the contracts in
// foundry.toml's gas_reports), prices each row at the latest base fee and the on-chain feed price
// through the same arithmetic as gasCostUsd in @gatedpath/chains, and prints RBNT and US cents per
// row, with `--diff <file>` against a previous snapshot or report. Read-only: two RPC reads
// (eth_getBlockByNumber and the feed) and nothing else. No key.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, relative, resolve } from 'node:path';
import { PRICE_FEED_DECIMALS, chainById, formatUnits, getLatestPrice, toCaller } from '@gatedpath/chains';
import { run } from './proc.js';

const require = createRequire(import.meta.url);
export const GAS_VERSION: string = (require('../package.json') as { version: string }).version;

export interface GasRow {
  /** `Contract:item`, the key rows are matched on across two files. */
  readonly name: string;
  readonly contract: string;
  /** A test name from a snapshot, a function signature from a gas report, or `deployment`. */
  readonly item: string;
  readonly gas: bigint;
  /** From a gas report: how many calls the mean is over. From a fuzz line: the runs. */
  readonly calls?: number;
  readonly min?: bigint;
  readonly max?: bigint;
}

export type GasSource = { readonly kind: 'snapshot'; readonly file: string } | { readonly kind: 'gas-report'; readonly command: string } | { readonly kind: 'gas-report-file'; readonly file: string };

export interface GasQuote {
  readonly chain: 151 | 153;
  readonly network: 'mainnet' | 'testnet';
  readonly rpc: string;
  readonly block: number;
  readonly baseFeeWei: bigint;
  /** The feed's raw integer (six decimals) and the derived USD per RBNT. */
  readonly priceRaw: bigint;
  readonly usdPerRbnt: number;
  readonly priceTimestamp: string;
  readonly priceFeed: string;
}

export interface PricedRow extends GasRow {
  readonly wei: bigint;
  readonly rbnt: string;
  readonly usd: number;
  /** US cents to three decimal places, as a number. */
  readonly cents: number;
  readonly before?: { readonly gas: bigint; readonly cents: number };
  readonly delta?: { readonly gas: bigint; readonly cents: number };
}

export interface GasReport {
  readonly tool: 'redbelly-gas';
  readonly version: string;
  readonly generatedAt: string;
  readonly project: string;
  readonly source: GasSource;
  readonly quote: GasQuote;
  readonly rows: readonly PricedRow[];
  readonly diff: { readonly file: string; readonly rows: number; readonly added: readonly string[]; readonly removed: readonly string[] } | null;
}

export interface GasOptions {
  /** A Foundry project, or a scaffold root (its contracts/ is used). Default: cwd. */
  project?: string;
  chain?: 151 | 153;
  rpc?: string;
  /** A snapshot or gas-report JSON file to price instead of the project's .gas-snapshot. */
  snapshot?: string;
  /** Run `forge test --gas-report --json` even when a .gas-snapshot exists. */
  report?: boolean;
  /** A previous snapshot or gas-report JSON to compare against. */
  diff?: string;
  env?: NodeJS.ProcessEnv;
}

// ---- parsing, pure ----

const SNAPSHOT_LINE = /^([A-Za-z0-9_$]+):(\S.*?)\s+\((.*)\)\s*$/;

/** `.gas-snapshot`: `Contract:test() (gas: N)`, fuzz lines by their mean (μ), invariant lines (no gas) skipped. */
export function parseGasSnapshot(text: string): GasRow[] {
  const rows: GasRow[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = SNAPSHOT_LINE.exec(line);
    if (!m) continue;
    const [, contract, item, inside] = m;
    const gas = /(?:^|,\s*)gas:\s*(\d+)/.exec(inside!);
    const mean = /μ:\s*(\d+)/.exec(inside!);
    const runs = /runs:\s*(\d+)/.exec(inside!);
    const median = /~:\s*(\d+)/.exec(inside!);
    if (gas) rows.push({ name: `${contract}:${item}`, contract: contract!, item: item!, gas: BigInt(gas[1]!) });
    else if (mean) rows.push({ name: `${contract}:${item}`, contract: contract!, item: item!, gas: BigInt(mean[1]!), ...(runs ? { calls: Number(runs[1]) } : {}), ...(median ? { min: BigInt(median[1]!), max: BigInt(median[1]!) } : {}) });
  }
  return rows;
}

interface ForgeGasReportEntry {
  contract: string;
  deployment?: { gas: number; size: number };
  functions?: Record<string, { calls: number; min: number; mean: number; median: number; max: number }>;
}

/** `forge test --gas-report --json`: the deployment row, then each function by its mean. Contract names lose their path. */
export function parseGasReportJson(json: unknown): GasRow[] {
  const entries = Array.isArray(json) ? (json as ForgeGasReportEntry[]) : [];
  const rows: GasRow[] = [];
  for (const e of entries) {
    if (!e || typeof e.contract !== 'string') continue;
    const contract = e.contract.includes(':') ? e.contract.slice(e.contract.lastIndexOf(':') + 1) : basename(e.contract, '.sol');
    if (e.deployment && typeof e.deployment.gas === 'number') rows.push({ name: `${contract}:deployment`, contract, item: 'deployment', gas: BigInt(e.deployment.gas) });
    for (const [sig, f] of Object.entries(e.functions ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      rows.push({ name: `${contract}:${sig}`, contract, item: sig, gas: BigInt(Math.round(f.mean)), calls: f.calls, min: BigInt(f.min), max: BigInt(f.max) });
    }
  }
  return rows;
}

/** Either format, by content: JSON that parses as an array is a gas report; anything else is a snapshot. */
export function parseGasFile(text: string): { kind: 'snapshot' | 'gas-report-file'; rows: GasRow[] } {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      return { kind: 'gas-report-file', rows: parseGasReportJson(JSON.parse(trimmed)) };
    } catch {
      /* fall through: not JSON after all */
    }
  }
  return { kind: 'snapshot', rows: parseGasSnapshot(text) };
}

// ---- pricing, pure given a quote ----

/** wei = gas * baseFee; thousandths of a US cent = wei * raw / 10^(18 + 6 - 5). Only the last step leaves BigInt. */
export function priceGas(gas: bigint, quote: Pick<GasQuote, 'baseFeeWei' | 'priceRaw'>): { wei: bigint; rbnt: string; usd: number; cents: number } {
  const wei = gas * quote.baseFeeWei;
  const scaled = wei * quote.priceRaw; // USD times 10^(18+6)
  const milliCents = scaled / 10n ** BigInt(18 + PRICE_FEED_DECIMALS - 5); // cents times 1000
  const cents = Number(milliCents) / 1000;
  const usd = Number((scaled * 1_000_000_000n) / 10n ** BigInt(18 + PRICE_FEED_DECIMALS)) / 1e9;
  return { wei, rbnt: formatUnits(wei, 18), usd, cents };
}

export function priceRows(rows: readonly GasRow[], quote: Pick<GasQuote, 'baseFeeWei' | 'priceRaw'>, before?: readonly GasRow[]): { rows: PricedRow[]; added: string[]; removed: string[] } {
  const prior = new Map((before ?? []).map((r) => [r.name, r]));
  const priced: PricedRow[] = rows.map((r) => {
    const p = priceGas(r.gas, quote);
    const b = prior.get(r.name);
    if (!before) return { ...r, ...p };
    if (!b) return { ...r, ...p };
    const bp = priceGas(b.gas, quote);
    return { ...r, ...p, before: { gas: b.gas, cents: bp.cents }, delta: { gas: r.gas - b.gas, cents: Math.round((p.cents - bp.cents) * 1000) / 1000 } };
  });
  const names = new Set(rows.map((r) => r.name));
  return { rows: priced, added: before ? rows.filter((r) => !prior.has(r.name)).map((r) => r.name) : [], removed: before ? [...prior.keys()].filter((n) => !names.has(n)) : [] };
}

// ---- the two reads ----

export async function quoteGas(rpc: string, expected?: 151 | 153): Promise<GasQuote> {
  const caller = toCaller(rpc);
  const reported = Number(BigInt((await caller('eth_chainId')) as string));
  if (reported !== 151 && reported !== 153) throw new Error(`the RPC at ${rpc} reports chain ${reported}; redbelly gas prices through the feed on 151 or 153 (a fork of either works)`);
  if (expected && reported !== expected) throw new Error(`--chain ${expected} but the RPC at ${rpc} reports ${reported}`);
  const block = (await caller('eth_getBlockByNumber', ['latest', false])) as { number?: string; baseFeePerGas?: string } | null;
  if (!block?.baseFeePerGas) throw new Error('the latest block has no baseFeePerGas');
  const price = await getLatestPrice({ rpc });
  return {
    chain: reported,
    network: reported === 151 ? 'mainnet' : 'testnet',
    rpc,
    block: Number(BigInt(block.number ?? '0x0')),
    baseFeeWei: BigInt(block.baseFeePerGas),
    priceRaw: price.raw,
    usdPerRbnt: price.usdPerRbnt,
    priceTimestamp: new Date(price.timestamp * 1000).toISOString(),
    priceFeed: price.priceFeed,
  };
}

/** A scaffold root's contracts/ when that is where foundry.toml is; otherwise the directory itself. */
export function foundryDir(project: string): string {
  if (!existsSync(join(project, 'foundry.toml')) && existsSync(join(project, 'contracts', 'foundry.toml'))) return join(project, 'contracts');
  return project;
}

export async function readGasSource(dir: string, opts: Pick<GasOptions, 'snapshot' | 'report' | 'env'>): Promise<{ source: GasSource; rows: GasRow[] }> {
  if (opts.snapshot) {
    const file = resolve(dir, opts.snapshot);
    if (!existsSync(file)) throw new Error(`no such file: ${file}`);
    const parsed = parseGasFile(readFileSync(file, 'utf8'));
    return { source: { kind: parsed.kind, file }, rows: parsed.rows };
  }
  const snapshot = join(dir, '.gas-snapshot');
  if (!opts.report && existsSync(snapshot)) return { source: { kind: 'snapshot', file: snapshot }, rows: parseGasSnapshot(readFileSync(snapshot, 'utf8')) };
  if (!existsSync(join(dir, 'foundry.toml'))) throw new Error(`no .gas-snapshot and no foundry.toml in ${dir}; pass --snapshot <file> or run from a Foundry project`);
  const args = ['test', '--gas-report', '--json'];
  const r = await run('forge', args, { cwd: dir, env: opts.env ?? process.env, timeoutMs: 600_000 });
  if (r.spawnError) throw new Error(`forge is not installed or not on PATH (${r.spawnError}); run redbelly-doctor`);
  const jsonStart = r.stdout.indexOf('[');
  if (r.code !== 0 || jsonStart < 0) throw new Error(`forge test --gas-report --json exited ${r.code}:\n${(r.stderr || r.stdout).trim().slice(-2000)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout.slice(jsonStart));
  } catch {
    throw new Error('forge printed a gas report that is not JSON');
  }
  return { source: { kind: 'gas-report', command: `forge ${args.join(' ')}` }, rows: parseGasReportJson(parsed) };
}

export async function runGas(opts: GasOptions = {}): Promise<GasReport> {
  const project = resolve(opts.project ?? process.cwd());
  const dir = foundryDir(project);
  const { source, rows } = await readGasSource(dir, opts);
  if (rows.length === 0) throw new Error(`nothing to price: ${source.kind === 'gas-report' ? 'the gas report has no contracts (set gas_reports in foundry.toml)' : `${(source as { file: string }).file} has no gas lines`}`);
  let before: GasRow[] | undefined;
  let diffFile: string | null = null;
  if (opts.diff) {
    diffFile = resolve(dir, opts.diff);
    if (!existsSync(diffFile)) throw new Error(`--diff: no such file: ${diffFile}`);
    before = parseGasFile(readFileSync(diffFile, 'utf8')).rows;
  }
  const chain = opts.chain ?? 153;
  const rpc = opts.rpc ?? chainById(chain)!.rpcUrls.default.http[0]!;
  const quote = await quoteGas(rpc, opts.chain);
  const priced = priceRows(rows, quote, before);
  return {
    tool: 'redbelly-gas',
    version: GAS_VERSION,
    generatedAt: new Date().toISOString(),
    project,
    source,
    quote,
    rows: priced.rows,
    diff: diffFile ? { file: diffFile, rows: before!.length, added: priced.added, removed: priced.removed } : null,
  };
}

// ---- text ----

const num = (n: bigint | number) => n.toLocaleString('en-US');
const fixed = (n: number, d: number) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const gwei = (wei: bigint) => `${fixed(Number(wei) / 1e9, 2)} gwei`;
const rbnt6 = (s: string) => {
  const n = Number(s);
  return n === 0 ? '0' : n < 0.000001 ? '<0.000001' : fixed(n, 6);
};
const signed = (n: bigint | number, d = 0) => (Number(n) > 0 ? '+' : '') + (typeof n === 'bigint' ? num(n) : fixed(n, d));

export function renderGasText(report: GasReport): string {
  const q = report.quote;
  const src = report.source.kind === 'gas-report' ? `${report.source.command} (${report.rows.length} rows)` : `${relative(report.project, report.source.file) || basename(report.source.file)} (${report.rows.length} rows${report.source.kind === 'snapshot' ? ', one per test' : ''})`;
  const lines: string[] = [];
  lines.push(`redbelly gas ${report.version}  project ${report.project}  source ${src}`);
  lines.push(`chain ${q.chain} (${q.network}) via ${q.rpc}  block ${num(q.block)}  base fee ${gwei(q.baseFeeWei)}  RBNT US$${fixed(q.usdPerRbnt, 6)} (feed at ${q.priceTimestamp})`);
  if (report.diff) lines.push(`diff against ${relative(report.project, report.diff.file) || report.diff.file} (${report.diff.rows} rows${report.diff.added.length ? `, ${report.diff.added.length} new here` : ''}${report.diff.removed.length ? `, ${report.diff.removed.length} gone` : ''})`);
  lines.push('');
  const w = Math.min(72, Math.max(24, ...report.rows.map((r) => r.name.length)));
  const head = ['Item'.padEnd(w), 'Gas'.padStart(11), 'RBNT'.padStart(12), 'US cents'.padStart(10)];
  if (report.diff) head.push('Gas diff'.padStart(11), 'Cents diff'.padStart(11));
  lines.push(head.join('  '));
  for (const r of report.rows) {
    const cells = [r.name.length > w ? r.name.slice(0, w - 1) + '…' : r.name.padEnd(w), num(r.gas).padStart(11), rbnt6(r.rbnt).padStart(12), fixed(r.cents, 3).padStart(10)];
    if (report.diff) cells.push((r.delta ? signed(r.delta.gas) : 'new').padStart(11), (r.delta ? signed(r.delta.cents, 3) : '').padStart(11));
    lines.push(cells.join('  '));
  }
  if (report.diff?.removed.length) lines.push('', `gone since ${basename(report.diff.file)}: ${report.diff.removed.join(', ')}`);
  const deploys = report.rows.filter((r) => r.item === 'deployment');
  lines.push('');
  if (deploys.length) lines.push(`deployment: ${deploys.map((d) => `${d.contract} ${num(d.gas)} gas = ${rbnt6(d.rbnt)} RBNT = US$${fixed(d.usd, 4)}`).join('; ')}. Pre-flight's balance check adds 25% on top; pass its --gas the figure here.`);
  lines.push(`Gas is priced in US dollars and converted to RBNT at execution from the feed, so the cents column is the stable one; the RBNT column moves with the price. Base fee only: the chain charges no priority fee.`);
  return lines.join('\n') + '\n';
}

/** JSON with BigInt as decimal strings. */
export function gasReportJson(report: GasReport): string {
  return JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n';
}
