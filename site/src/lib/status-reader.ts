// One reader for the status page, used at build (Node's fetch) and in the browser (the
// visitor's fetch). Plain JSON-RPC, one batched POST for the block window, no library. Every
// figure it computes is named the way phase-0/measure-blocktime.mjs and RESEARCH.md name it.

export interface MeasureChain {
  id: number;
  key: string;
  rpc: string;
  pricefeed: `0x${string}`;
}

export interface IntervalStats {
  blocks: number;
  firstBlock: number;
  lastBlock: number;
  median: number;
  p95: number;
  min: number;
  max: number;
  emptyBlocks: number;
  txPerBlockMedian: number;
  txPerBlockMax: number;
}

export interface GasReading {
  baseFeeWei: string;
  baseFeeGwei: number;
  gasPriceWei: string;
  usdPerRbnt: number;
  feedTime: string;
  transferRbnt: number;
  transferUsd: number;
}

export interface ChainReading {
  ok: boolean;
  error?: string;
  checkedAt: string;
  latencyMs: number | null;
  chainId: number | null;
  head: number | null;
  headAgeSeconds: number | null;
  interval: IntervalStats | null;
  gas: GasReading | null;
}

export interface MeasureOptions {
  timeoutMs?: number;
  selector?: string;
  intervalBlocks?: number;
  transferGas?: number;
  priceDecimals?: number;
  fetch?: typeof fetch;
}

const DEFAULTS = { timeoutMs: 8000, selector: '0x8e15f473', intervalBlocks: 25, transferGas: 21_000, priceDecimals: 6 };

type RpcResult = { id: number; result?: unknown; error?: { message?: string } };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

async function post(url: string, body: unknown, timeoutMs: number, doFetch: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function unwrap(results: unknown, count: number): unknown[] {
  if (!Array.isArray(results)) throw new Error('batch response is not an array');
  const byId = new Map<number, RpcResult>();
  for (const r of results as RpcResult[]) byId.set(r.id, r);
  const out: unknown[] = [];
  for (let i = 1; i <= count; i++) {
    const r = byId.get(i);
    if (!r) throw new Error(`no response for request ${i}`);
    if (r.error) throw new Error(r.error.message ?? 'RPC error');
    out.push(r.result);
  }
  return out;
}

const hexToNumber = (h: unknown): number => Number(BigInt(h as string));

/** Reads chain id, head, the block window, base fee and the feed price. Never throws; `ok` says. */
export async function measure(chain: MeasureChain, options: MeasureOptions = {}): Promise<ChainReading> {
  const o = { ...DEFAULTS, ...options };
  const doFetch = o.fetch ?? globalThis.fetch;
  const checkedAt = new Date().toISOString();
  const failed = (error: string): ChainReading => ({ ok: false, error, checkedAt, latencyMs: null, chainId: null, head: null, headAgeSeconds: null, interval: null, gas: null });
  try {
    // 1. Chain id, head, gas price, latest block, feed price: one batch, timed.
    const t0 = performance.now();
    const first = unwrap(
      await post(
        chain.rpc,
        [
          { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
          { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] },
          { jsonrpc: '2.0', id: 3, method: 'eth_gasPrice', params: [] },
          { jsonrpc: '2.0', id: 4, method: 'eth_getBlockByNumber', params: ['latest', false] },
          { jsonrpc: '2.0', id: 5, method: 'eth_call', params: [{ to: chain.pricefeed, data: o.selector }, 'latest'] },
        ],
        o.timeoutMs,
        doFetch,
      ),
      5,
    );
    const latencyMs = Math.round(performance.now() - t0);
    const chainId = hexToNumber(first[0]);
    const head = hexToNumber(first[1]);
    const gasPriceWei = BigInt(first[2] as string);
    const latest = first[3] as { timestamp: string; baseFeePerGas?: string; number: string } | null;
    const priceHex = first[4] as string;
    if (!latest) throw new Error('latest block is null');
    const headAgeSeconds = Math.max(0, Math.floor(Date.now() / 1000) - hexToNumber(latest.timestamp));

    // 2. The window: the last N blocks in one batch, timestamps and transaction counts only.
    const n = Math.min(o.intervalBlocks, head + 1);
    const from = head - n + 1;
    const batch = [];
    for (let i = 0; i < n; i++) batch.push({ jsonrpc: '2.0', id: i + 1, method: 'eth_getBlockByNumber', params: ['0x' + (from + i).toString(16), false] });
    const blocks = unwrap(await post(chain.rpc, batch, o.timeoutMs, doFetch), n) as Array<{ timestamp: string; transactions: unknown[] } | null>;
    const rows = blocks.map((b, i) => ({ number: from + i, timestamp: b ? hexToNumber(b.timestamp) : null, txCount: b ? b.transactions.length : null }));
    const usable = rows.filter((r) => r.timestamp !== null) as Array<{ number: number; timestamp: number; txCount: number }>;
    const intervals = usable.slice(1).map((r, i) => r.timestamp - usable[i]!.timestamp);
    const interval: IntervalStats | null = intervals.length
      ? {
          blocks: usable.length,
          firstBlock: usable[0]!.number,
          lastBlock: usable[usable.length - 1]!.number,
          median: median(intervals),
          p95: percentile(intervals, 95),
          min: Math.min(...intervals),
          max: Math.max(...intervals),
          emptyBlocks: usable.filter((r) => r.txCount === 0).length,
          txPerBlockMedian: median(usable.map((r) => r.txCount)),
          txPerBlockMax: Math.max(...usable.map((r) => r.txCount)),
        }
      : null;

    // 3. Gas: base fee from the block, the feed's USD per RBNT (six decimals, measured), and
    //    what a native transfer costs in both units right now.
    let gas: GasReading | null = null;
    if (latest.baseFeePerGas && priceHex && priceHex.length >= 130) {
      const baseFeeWei = BigInt(latest.baseFeePerGas);
      const price = BigInt('0x' + priceHex.slice(2, 66));
      const feedTs = Number(BigInt('0x' + priceHex.slice(66, 130)));
      const usdPerRbnt = Number(price) / 10 ** o.priceDecimals;
      const transferWei = baseFeeWei * BigInt(o.transferGas);
      const transferRbnt = Number(transferWei) / 1e18;
      gas = {
        baseFeeWei: baseFeeWei.toString(),
        baseFeeGwei: Number(baseFeeWei) / 1e9,
        gasPriceWei: gasPriceWei.toString(),
        usdPerRbnt,
        feedTime: new Date(feedTs * 1000).toISOString(),
        transferRbnt,
        transferUsd: transferRbnt * usdPerRbnt,
      };
    }

    return { ok: true, checkedAt, latencyMs, chainId, head, headAgeSeconds, interval, gas };
  } catch (error) {
    const message = error instanceof Error ? (error.name === 'AbortError' ? `timed out after ${o.timeoutMs} ms` : error.message) : String(error);
    return failed(message);
  }
}
