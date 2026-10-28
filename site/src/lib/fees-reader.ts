// Reads for the fee checker, written to run both at build time (Node) and in the visitor's browser.
// Nothing here stores anything or talks to anyone but the public RPC the visitor chose to read.
export interface FeeChain {
  key: string;
  id: number;
  rpc: string;
  pricefeed: `0x${string}`;
}

export interface FeesNow {
  ok: boolean;
  error?: string;
  latencyMs: number;
  checkedAt: string;
  head: number | null;
  headTime: number | null;
  baseFeeWei: bigint | null;
  usdPerRbnt: number | null;
  feedTime: number | null;
}

export interface HistoryPoint {
  block: number;
  time: number;
  baseFeeWei: bigint;
}

export interface Cost {
  rbnt: number;
  usd: number;
}

export interface ReadOptions {
  timeoutMs?: number;
  selector?: string;
  priceDecimals?: number;
  fetch?: typeof fetch;
}

async function post(url: string, body: unknown, timeoutMs: number, doFetch: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const hex = (v: unknown): bigint => BigInt(typeof v === 'string' ? v : '0x0');

/** The two figures a cost needs, now: the base fee and the feed price, plus the head for dating. */
export async function readFeesNow(chain: FeeChain, options: ReadOptions = {}): Promise<FeesNow> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const selector = options.selector ?? '0x8e15f473';
  const decimals = options.priceDecimals ?? 6;
  const doFetch = options.fetch ?? fetch;
  const t0 = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const batch = [
      { jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] },
      { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: chain.pricefeed, data: selector }, 'latest'] },
    ];
    const out = (await post(chain.rpc, batch, timeoutMs, doFetch)) as { id: number; result?: unknown; error?: { message: string } }[];
    const byId = new Map(out.map((r) => [r.id, r]));
    const block = byId.get(1)?.result as { number: string; timestamp: string; baseFeePerGas?: string } | undefined;
    const call = byId.get(2);
    if (!block) throw new Error(byId.get(1)?.error?.message ?? 'no latest block');
    if (!call || typeof call.result !== 'string') throw new Error(call?.error?.message ?? 'price feed did not answer');
    const data = call.result.slice(2);
    const raw = BigInt('0x' + data.slice(0, 64));
    const ts = Number(BigInt('0x' + data.slice(64, 128)));
    return {
      ok: true,
      latencyMs: Date.now() - t0,
      checkedAt,
      head: Number(hex(block.number)),
      headTime: Number(hex(block.timestamp)),
      baseFeeWei: hex(block.baseFeePerGas),
      usdPerRbnt: Number(raw) / 10 ** decimals,
      feedTime: ts,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0, checkedAt, head: null, headTime: null, baseFeeWei: null, usdPerRbnt: null, feedTime: null };
  }
}

/** The base fee at past block heights, one batch, so a chart can show what a call cost then. */
export async function readFeeHistory(chain: FeeChain, blocks: number[], options: ReadOptions = {}): Promise<HistoryPoint[]> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const doFetch = options.fetch ?? fetch;
  const batch = blocks.map((b, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'eth_getBlockByNumber', params: ['0x' + b.toString(16), false] }));
  const out = (await post(chain.rpc, batch, timeoutMs, doFetch)) as { id: number; result?: { number: string; timestamp: string; baseFeePerGas?: string } | null }[];
  const points: HistoryPoint[] = [];
  for (const r of out) {
    const b = r.result;
    if (!b || !b.number) continue;
    points.push({ block: Number(hex(b.number)), time: Number(hex(b.timestamp)), baseFeeWei: hex(b.baseFeePerGas) });
  }
  return points.sort((a, b) => a.block - b.block);
}

/** What `gas` costs at a base fee and a feed price. Integers until the last step. */
export function cost(gas: number, baseFeeWei: bigint, usdPerRbnt: number): Cost {
  const wei = BigInt(Math.round(gas)) * baseFeeWei;
  const rbnt = Number(wei / 1_000_000_000_000n) / 1e6; // six decimals of RBNT
  return { rbnt, usd: rbnt * usdPerRbnt };
}

export interface ChartPoint {
  block: number;
  time: number;
  rbnt: number;
  usd: number;
}

/** The history priced for one call: RBNT from the base fee at that block, dollars by the network's fixed rate. */
export function priceHistory(points: HistoryPoint[], gas: number, usdPerGas: number): ChartPoint[] {
  return points.map((p) => ({ block: p.block, time: p.time, rbnt: cost(gas, p.baseFeeWei, 0).rbnt, usd: gas * usdPerGas }));
}

const monthShort = (t: number) => new Date(t * 1000).toLocaleDateString('en-AU', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/**
 * One small chart as an SVG string: a single thin line, log or linear y, the first and last points
 * labelled, a recessive grid, every point carrying a <title> for hover. No library.
 */
export function chartSvg(points: ChartPoint[], field: 'rbnt' | 'usd', opts: { title: string; unit: string; log?: boolean; width?: number; height?: number }): string {
  const W = opts.width ?? 360;
  const H = opts.height ?? 200;
  const pad = { l: 44, r: 16, t: 24, b: 30 };
  const xs = points.map((p) => p.time);
  const ys = points.map((p) => p[field]);
  if (points.length < 2) return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.title}: not enough data"></svg>`;
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yv = (y: number) => (opts.log ? Math.log10(Math.max(y, 1e-9)) : y);
  let yMin = Math.min(...ys.map(yv));
  let yMax = Math.max(...ys.map(yv));
  if (!opts.log) {
    yMin = 0;
    yMax = Math.max(yMax * 1.25, 0.01);
  } else {
    yMin = Math.floor(yMin);
    yMax = Math.ceil(yMax);
  }
  const sx = (x: number) => pad.l + ((x - x0) / Math.max(x1 - x0, 1)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (yv(y) - yMin) / Math.max(yMax - yMin, 1e-9)) * (H - pad.t - pad.b);
  const fmt = (v: number) => (field === 'usd' ? `US$${v.toFixed(2)}` : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  const ticks: number[] = opts.log
    ? Array.from({ length: yMax - yMin + 1 }, (_, i) => 10 ** (yMin + i))
    : [0, yMax / 2, yMax];
  const grid = ticks
    .map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${sy(t).toFixed(1)}" y2="${sy(t).toFixed(1)}" class="rb-chart__grid"/><text x="${pad.l - 6}" y="${(sy(t) + 3).toFixed(1)}" class="rb-chart__tick" text-anchor="end">${fmt(t)}</text>`)
    .join('');
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.time).toFixed(1)},${sy(p[field]).toFixed(1)}`).join(' ');
  const dots = points
    .map((p) => `<circle cx="${sx(p.time).toFixed(1)}" cy="${sy(p[field]).toFixed(1)}" r="4" class="rb-chart__dot"><title>${monthShort(p.time)}, block ${p.block.toLocaleString('en-AU')}: ${fmt(p[field])} ${opts.unit}</title></circle>`)
    .join('');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const labels = `<text x="${(sx(first.time) + 6).toFixed(1)}" y="${(sy(first[field]) - 8).toFixed(1)}" class="rb-chart__label">${fmt(first[field])}</text><text x="${(sx(last.time) - 6).toFixed(1)}" y="${(sy(last[field]) - 8).toFixed(1)}" class="rb-chart__label" text-anchor="end">${fmt(last[field])}</text>`;
  const xLabels = `<text x="${pad.l}" y="${H - 8}" class="rb-chart__tick">${monthShort(first.time)}</text><text x="${W - pad.r}" y="${H - 8}" class="rb-chart__tick" text-anchor="end">${monthShort(last.time)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.title}" class="rb-chart"><text x="${pad.l}" y="14" class="rb-chart__title">${opts.title}</text>${grid}<path d="${path}" class="rb-chart__line"/>${dots}${labels}${xLabels}</svg>`;
}
