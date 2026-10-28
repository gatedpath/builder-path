// redbelly fees: the command-line twin of the site's fee checker (/fees/, "What it costs"). Per chain
// it reads the head block, the base fee and the feed price (the same three reads as `redbelly gas`,
// through quoteGas), prices the measured calls a builder meets at today's base fee, and on mainnet
// reads the base fee at nine block heights so the enable call can be seen across the network's life.
// Read-only, no key, nothing written. The gas figures below are copied from the site's data file;
// each one names the run that measured it and is never typed from a document.
import { createRpc, chainById } from '@gatedpath/chains';
import { GAS_VERSION, priceGas, quoteGas } from './gas.js';
import type { GasQuote } from './gas.js';

export const FEES_VERSION = GAS_VERSION;

export interface ReferenceCall {
  readonly key: string;
  readonly label: string;
  readonly gas: bigint;
  /** Where the gas figure comes from, with the date. */
  readonly measured: string;
}

/** Calls a builder meets, with gas as measured, oldest measurement last. Same table as the site. */
export const REFERENCE_CALLS: readonly ReferenceCall[] = [
  { key: 'transfer', label: 'A native transfer', gas: 21_000n, measured: 'the EVM constant; Vine prices it at US$0.01' },
  { key: 'guard', label: 'Deploying the recipient guard (project 13)', gas: 503_685n, measured: 'measured on 153, 17 October 2026, block 3,052,324' },
  { key: 'token', label: 'Deploying the gated token (the scaffold)', gas: 1_971_486n, measured: 'the ship report on 153, 17 October 2026' },
  { key: 'enable', label: 'Enabling a wallet on the network', gas: 2_154_375n, measured: 'measured on 151, 17 October 2026, block 3,228,354' },
];

/** The network prices gas in US dollars: Vine's figure, measured in RESEARCH.md question 3 (US$0.01 for a 21,000-gas transfer). */
export const USD_PER_GAS = 0.01 / 21_000;

/** Mainnet block heights sampled for the history: genesis week, then roughly every four months to the head. */
export const HISTORY_BLOCKS_151: readonly number[] = [204, 400_000, 800_000, 1_200_000, 1_600_000, 2_000_000, 2_400_000, 2_800_000, 3_100_000];

/** The call the history is drawn for: enabling a wallet. */
export const HISTORY_GAS = 2_154_375n;

export interface PricedCall extends ReferenceCall {
  readonly wei: bigint;
  readonly rbnt: string;
  readonly usd: number;
  /** US cents to three decimal places, as a number. */
  readonly cents: number;
}

export interface HistoryPoint {
  readonly block: number;
  readonly time: string;
  readonly baseFeeWei: bigint;
  /** The enable call at that block's base fee. */
  readonly rbnt: string;
  /** The same call at the network's fixed dollar rate; the line that should not move. */
  readonly usd: number;
}

export interface FeesChainOk {
  readonly ok: true;
  readonly chain: 151 | 153;
  readonly network: 'mainnet' | 'testnet';
  readonly rpc: string;
  readonly latencyMs: number;
  readonly quote: GasQuote;
  readonly calls: readonly PricedCall[];
  /** The history, mainnet only; null on testnet, and null with a reason when the reads failed. */
  readonly history: readonly HistoryPoint[] | null;
  readonly historyError: string | null;
}

export interface FeesChainFailed {
  readonly ok: false;
  readonly chain: 151 | 153 | null;
  readonly network: 'mainnet' | 'testnet' | null;
  readonly rpc: string;
  readonly latencyMs: number;
  readonly error: string;
}

export type FeesChain = FeesChainOk | FeesChainFailed;

export interface FeesReport {
  readonly tool: 'redbelly-fees';
  readonly version: string;
  readonly generatedAt: string;
  readonly chains: readonly FeesChain[];
  /** True when every chain was read. */
  readonly ok: boolean;
}

export interface FeesOptions {
  /** One chain; both when absent. With --rpc and no chain, the RPC says which it is. */
  chain?: 151 | 153;
  rpc?: string;
  /** Per request. Default 10 seconds. */
  timeoutMs?: number;
  /** Tests pass a fake; otherwise the global fetch. */
  fetch?: typeof fetch;
  /** Skip the mainnet history reads. */
  history?: boolean;
}

/** Each request gets its own deadline; a node that hangs is reported as a timeout rather than waited on. */
function withTimeout(doFetch: typeof fetch, timeoutMs: number): typeof fetch {
  return (input, init) => doFetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export function priceCalls(quote: Pick<GasQuote, 'baseFeeWei' | 'priceRaw'>, calls: readonly ReferenceCall[] = REFERENCE_CALLS): PricedCall[] {
  return calls.map((c) => ({ ...c, ...priceGas(c.gas, quote) }));
}

/** The base fee at past block heights, each priced for the enable call; blocks the node does not have are left out. */
export async function readFeeHistory(rpc: string, blocks: readonly number[], opts: { fetch?: typeof fetch; gas?: bigint } = {}): Promise<HistoryPoint[]> {
  const caller = createRpc(rpc, opts.fetch ? { fetch: opts.fetch } : {});
  const gas = opts.gas ?? HISTORY_GAS;
  const results = await Promise.all(blocks.map((b) => caller('eth_getBlockByNumber', ['0x' + b.toString(16), false]) as Promise<{ number?: string; timestamp?: string; baseFeePerGas?: string } | null>));
  const points: HistoryPoint[] = [];
  for (const b of results) {
    if (!b?.number || !b.baseFeePerGas) continue;
    const baseFeeWei = BigInt(b.baseFeePerGas);
    // The dollar figure is the fixed rate, not the feed at that block: it is the line the chart shows flat.
    points.push({ block: Number(BigInt(b.number)), time: new Date(Number(BigInt(b.timestamp ?? '0x0')) * 1000).toISOString(), baseFeeWei, rbnt: priceGas(gas, { baseFeeWei, priceRaw: 0n }).rbnt, usd: Number(gas) * USD_PER_GAS });
  }
  return points.sort((a, b) => a.block - b.block);
}

/** One chain: the quote, the four calls priced, and on mainnet the history. Never throws; a failed read is a result. */
export async function readFeesChain(rpc: string, expected: 151 | 153 | undefined, opts: FeesOptions = {}): Promise<FeesChain> {
  const doFetch = withTimeout(opts.fetch ?? fetch, opts.timeoutMs ?? 10_000);
  const t0 = Date.now();
  let quote: GasQuote;
  try {
    quote = await quoteGas(rpc, expected, { fetch: doFetch });
  } catch (e) {
    const chain = expected ?? null;
    return { ok: false, chain, network: chain === null ? null : chain === 151 ? 'mainnet' : 'testnet', rpc, latencyMs: Date.now() - t0, error: (e as Error).message };
  }
  const calls = priceCalls(quote);
  let history: HistoryPoint[] | null = null;
  let historyError: string | null = null;
  if (quote.chain === 151 && opts.history !== false) {
    try {
      // The head is read again by height so the last point and the quote name the same block.
      history = await readFeeHistory(rpc, [...HISTORY_BLOCKS_151.filter((b) => b < quote.block), quote.block], { fetch: doFetch });
    } catch (e) {
      historyError = (e as Error).message;
    }
  }
  return { ok: true, chain: quote.chain, network: quote.network, rpc, latencyMs: Date.now() - t0, quote, calls, history, historyError };
}

export async function runFees(opts: FeesOptions = {}): Promise<FeesReport> {
  let chains: FeesChain[];
  if (opts.rpc) {
    chains = [await readFeesChain(opts.rpc, opts.chain, opts)];
  } else {
    const ids: (151 | 153)[] = opts.chain ? [opts.chain] : [151, 153];
    chains = await Promise.all(ids.map((id) => readFeesChain(chainById(id)!.rpcUrls.default.http[0]!, id, opts)));
  }
  return { tool: 'redbelly-fees', version: FEES_VERSION, generatedAt: new Date().toISOString(), chains, ok: chains.every((c) => c.ok) };
}

// ---- text ----

const num = (n: bigint | number) => n.toLocaleString('en-US');
const fixed = (n: number, d: number) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const gwei = (wei: bigint) => `${fixed(Number(wei) / 1e9, 2)} gwei`;
const rbnt = (s: string) => {
  const n = Number(s);
  return n === 0 ? '0' : n < 0.000001 ? '<0.000001' : fixed(n, n < 1 ? 6 : 3);
};
const when = (iso: string) => iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

export function renderFeesText(report: FeesReport): string {
  const lines: string[] = [];
  lines.push(`redbelly fees ${report.version}  ${when(report.generatedAt)}`);
  for (const c of report.chains) {
    lines.push('');
    if (!c.ok) {
      lines.push(`chain ${c.chain ?? '?'}${c.network ? ` (${c.network})` : ''} via ${c.rpc}: could not be read: ${c.error}`);
      continue;
    }
    const q = c.quote;
    lines.push(`chain ${c.chain} (${c.network}) via ${c.rpc}  read in ${num(c.latencyMs)} ms`);
    lines.push(`head block ${num(q.block)} at ${when(q.blockTimestamp)}  base fee ${gwei(q.baseFeeWei)}`);
    lines.push(`RBNT US$${fixed(q.usdPerRbnt, 6)} from the feed at ${when(q.priceTimestamp)}`);
    lines.push('');
    const w = Math.max(...c.calls.map((r) => r.label.length));
    lines.push(['Call'.padEnd(w), 'Gas'.padStart(11), 'RBNT'.padStart(12), 'US cents'.padStart(10)].join('  '));
    for (const r of c.calls) lines.push([r.label.padEnd(w), num(r.gas).padStart(11), rbnt(r.rbnt).padStart(12), fixed(r.cents, 3).padStart(10)].join('  '));
    const enable = c.calls.find((r) => r.key === 'enable');
    if (enable) lines.push('', `enable: ${num(enable.gas)} gas = ${rbnt(enable.rbnt)} RBNT = US$${fixed(enable.usd, 4)} now; at the network's fixed rate of US$0.01 per 21,000 gas it is US$${fixed(Number(enable.gas) * USD_PER_GAS, 2)}, whatever RBNT trades at.`);
    if (c.history && c.history.length) {
      lines.push('', `the enable call across mainnet's life (${num(HISTORY_GAS)} gas at the base fee of each block; dollars at the fixed rate):`);
      lines.push(['Block'.padStart(11), 'Date'.padEnd(10), 'Base fee'.padStart(20), 'RBNT'.padStart(12), 'US$'.padStart(8)].join('  '));
      for (const p of c.history) lines.push([num(p.block).padStart(11), p.time.slice(0, 10).padEnd(10), gwei(p.baseFeeWei).padStart(20), rbnt(p.rbnt).padStart(12), fixed(p.usd, 2).padStart(8)].join('  '));
    } else if (c.historyError) {
      lines.push('', `history: not read (${c.historyError})`);
    }
  }
  lines.push('', 'Gas is priced in US dollars and converted to RBNT at execution from the feed, so the cents column is the stable one; the RBNT column moves with the price. Base fee only: the chain charges no priority fee.');
  return lines.join('\n') + '\n';
}

/** JSON with BigInt as decimal strings. */
export function feesReportJson(report: FeesReport): string {
  return JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n';
}
