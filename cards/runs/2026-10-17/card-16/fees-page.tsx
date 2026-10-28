"use client";

import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { gasCostUsd, redbellyMainnet, redbellyTestnet } from "@gatedpath/chains";

/**
 * The fee checker (project 16).
 *
 * Gas on this network is priced in US dollars and paid in RBNT at the on-chain feed's rate, and
 * most wallets show it wrongly (Vine's own warning). This page reads the two figures a cost needs,
 * the latest base fee and the feed price, from each chain's public RPC, and prices four calls that
 * were measured on the real network. A box prices any gas figure you type. The chart reads the base
 * fee at nine mainnet block heights, from the first week of mainnet to the head, and prices the
 * enable call at each: a line that climbs in RBNT and sits flat in dollars, which is the whole
 * story of fees here. Nothing is stored and nothing is sent anywhere but the RPCs named below.
 *
 * What this page is not: an estimate for your own contract (measure it with `forge test --gas-report`
 * or a receipt), or a price of RBNT anywhere but the network's own feed.
 */

const CHAINS = [redbellyMainnet, redbellyTestnet] as const;

/** Each gas figure is from a receipt or a measured call; the note says where. */
const REFERENCE_CALLS = [
  { label: "A plain RBNT transfer", gas: 21_000, measured: "the network's own rate: US$0.01 per 21,000 gas" },
  { label: "Deploying the recipient guard (project 13)", gas: 503_685, measured: "receipt on chain 153, block 3,052,324, 17 October 2026" },
  { label: "Deploying the scaffold's gated token", gas: 1_971_486, measured: "forge gas report, 0.2.1 scaffold" },
  { label: "Enabling a wallet on the network", gas: 2_154_375, measured: "receipts of the enable method 0x33f6cfb2 on chain 151" },
];

/** Nine heights across mainnet's life, then the head. Block 204 is the first week of mainnet. */
const HISTORY_BLOCKS = [204, 400_000, 800_000, 1_200_000, 1_600_000, 2_000_000, 2_400_000, 2_800_000, 3_100_000];
const ENABLE_GAS = 2_154_375;
const USD_PER_GAS = 0.01 / 21_000;

type Now = { head: bigint; headTime: number; baseFeeWei: bigint; usdPerRbnt: number; feedTime: number; readAt: string; latencyMs: number };
type Point = { block: number; time: number; rbnt: number; usd: number };

const clientFor = (chain: (typeof CHAINS)[number]) => createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });

/** RBNT from gas and a base fee, in integers until the last step (six decimals kept). */
function rbntOf(gas: number, baseFeeWei: bigint): number {
  return Number((BigInt(gas) * baseFeeWei) / 1_000_000_000_000n) / 1e6;
}

async function readNow(chain: (typeof CHAINS)[number]): Promise<Now> {
  const t0 = Date.now();
  const client = clientFor(chain);
  const block = await client.getBlock({ blockTag: "latest" });
  if (block.baseFeePerGas === null) throw new Error("latest block has no baseFeePerGas");
  // One call of the kit's helper for 21,000 gas gives the feed price and its timestamp beside the base fee.
  const c = await gasCostUsd({ gasUsed: 21_000, gasPriceWei: block.baseFeePerGas, rpc: chain.rpcUrls.default.http[0] });
  return { head: block.number, headTime: Number(block.timestamp), baseFeeWei: block.baseFeePerGas, usdPerRbnt: c.usdPerRbnt, feedTime: c.priceTimestamp, readAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
}

async function readHistory(head: bigint | undefined): Promise<Point[]> {
  const client = clientFor(redbellyMainnet);
  const heights = head ? [...HISTORY_BLOCKS, Number(head)] : HISTORY_BLOCKS;
  const blocks = await Promise.all(heights.map((n) => client.getBlock({ blockNumber: BigInt(n) })));
  return blocks
    .filter((b) => b.baseFeePerGas !== null)
    .map((b) => ({ block: Number(b.number), time: Number(b.timestamp), rbnt: rbntOf(ENABLE_GAS, b.baseFeePerGas!), usd: ENABLE_GAS * USD_PER_GAS }))
    .sort((a, b) => a.block - b.block);
}

const when = (iso: string) => iso.replace("T", " ").replace(/\.\d+Z$/, " UTC");
const whenUnix = (t: number) => when(new Date(t * 1000).toISOString());
const month = (t: number) => new Date(t * 1000).toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" });
const fmtRbnt = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(4));
const fmtUsd = (v: number) => `US$${v < 0.1 ? v.toFixed(4) : v.toFixed(2)}`;

export default function FeesPage() {
  const queries = useQueries({
    queries: CHAINS.map((chain) => ({ queryKey: ["fees-now", chain.id], queryFn: () => readNow(chain), refetchInterval: 60_000, retry: 1 })),
  });
  const now = CHAINS.map((chain, i) => ({ chain, query: queries[i] }));
  const mainHead = now[0].query.data?.head;
  const history = useQuery({ queryKey: ["fees-history", mainHead?.toString()], queryFn: () => readHistory(mainHead), enabled: mainHead !== undefined, staleTime: Infinity, retry: 1 });

  const [gasText, setGasText] = useState("100000");
  const gas = Number(gasText.replace(/[^0-9]/g, "")) || 0;

  return (
    <main>
      <h1>What it costs</h1>
      <p>
        Gas here is priced in US dollars and paid in RBNT at the network&apos;s own feed rate, so a wallet&apos;s gas display is often wrong.
        These figures come straight from each chain&apos;s public RPC, read in your browser, and nothing is sent anywhere else.
      </p>

      {now.map(({ chain, query }) => (
        <section className="card" key={chain.id}>
          <h2 style={{ fontSize: "1.1rem", margin: "0 0 8px" }}>
            {chain.name} (chain {chain.id})
          </h2>
          {query.isPending && <p className="muted">Reading the latest block and the price feed…</p>}
          {query.error && <p className="muted">Could not read {chain.rpcUrls.default.http[0]}: {query.error.message}</p>}
          {query.data && (
            <>
              <p className="muted">
                Read {when(query.data.readAt)} in {query.data.latencyMs} ms. Head block {query.data.head.toLocaleString("en-AU")}, mined {whenUnix(query.data.headTime)}.
              </p>
              <p>
                Base fee <strong>{(Number(query.data.baseFeeWei) / 1e9).toLocaleString("en-AU", { maximumFractionDigits: 2 })} gwei</strong>. Feed price{" "}
                <strong>US${query.data.usdPerRbnt.toFixed(6)}</strong> per RBNT, set {whenUnix(query.data.feedTime)}.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Call</th>
                    <th style={{ textAlign: "right" }}>Gas</th>
                    <th style={{ textAlign: "right" }}>RBNT</th>
                    <th style={{ textAlign: "right" }}>USD</th>
                  </tr>
                </thead>
                <tbody>
                  {REFERENCE_CALLS.map((r) => {
                    const rbnt = rbntOf(r.gas, query.data.baseFeeWei);
                    return (
                      <tr key={r.label} title={`Measured: ${r.measured}`}>
                        <td>{r.label}</td>
                        <td style={{ textAlign: "right" }}>{r.gas.toLocaleString("en-AU")}</td>
                        <td style={{ textAlign: "right" }}>{fmtRbnt(rbnt)}</td>
                        <td style={{ textAlign: "right" }}>{fmtUsd(rbnt * query.data.usdPerRbnt)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td>
                      <label>
                        Your own figure:{" "}
                        <input inputMode="numeric" value={gasText} onChange={(e) => setGasText(e.target.value)} style={{ width: "9em", font: "inherit" }} aria-label="gas used" />{" "}
                        gas
                      </label>
                    </td>
                    <td style={{ textAlign: "right" }}>{gas.toLocaleString("en-AU")}</td>
                    <td style={{ textAlign: "right" }}>{fmtRbnt(rbntOf(gas, query.data.baseFeeWei))}</td>
                    <td style={{ textAlign: "right" }}>{fmtUsd(rbntOf(gas, query.data.baseFeeWei) * query.data.usdPerRbnt)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="muted">Hover a row for where its gas figure was measured. A contract of your own is measured, not guessed: <code>forge test --gas-report</code>, or the receipt.</p>
            </>
          )}
        </section>
      ))}

      <section className="card">
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 8px" }}>Enabling a wallet, across two years of mainnet</h2>
        <p className="muted">
          The base fee at nine block heights from the first week of mainnet to the head, priced for the enable call ({ENABLE_GAS.toLocaleString("en-AU")} gas). The dollar line
          is flat because the network prices gas in dollars; the RBNT line climbs as the token&apos;s price fell. Hover a point for its block and date.
        </p>
        {history.isPending && <p className="muted">Reading ten mainnet blocks…</p>}
        {history.error && <p className="muted">Could not read the history: {history.error.message}</p>}
        {history.data && history.data.length >= 2 && (
          <>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <Chart points={history.data} field="rbnt" title="In RBNT (log scale)" log />
              <Chart points={history.data} field="usd" title="In US dollars" />
            </div>
            <details>
              <summary className="muted">The same figures as a table</summary>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Block</th>
                    <th style={{ textAlign: "left" }}>Date (UTC)</th>
                    <th style={{ textAlign: "right" }}>RBNT</th>
                    <th style={{ textAlign: "right" }}>USD</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.map((p) => (
                    <tr key={p.block}>
                      <td>{p.block.toLocaleString("en-AU")}</td>
                      <td>{whenUnix(p.time).slice(0, 10)}</td>
                      <td style={{ textAlign: "right" }}>{fmtRbnt(p.rbnt)}</td>
                      <td style={{ textAlign: "right" }}>{fmtUsd(p.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </section>

      <p className="muted">
        What this is not: a fee estimate for a contract you have not measured, or a price of RBNT anywhere but the network&apos;s own feed. RPCs read:{" "}
        {CHAINS.map((c) => c.rpcUrls.default.http[0]).join(" and ")}.
      </p>
      <p className="muted">
        <a href="/">Back to the gated action</a>
      </p>
    </main>
  );
}

/** One thin line, the first and last points labelled, a title on every point for hover. No library. */
function Chart({ points, field, title, log }: { points: Point[]; field: "rbnt" | "usd"; title: string; log?: boolean }) {
  const W = 360;
  const H = 200;
  const pad = { l: 48, r: 16, t: 24, b: 30 };
  const fmt = field === "usd" ? fmtUsd : fmtRbnt;
  const geometry = useMemo(() => {
    const xs = points.map((p) => p.time);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const yv = (y: number) => (log ? Math.log10(Math.max(y, 1e-9)) : y);
    let yMin = Math.min(...points.map((p) => yv(p[field])));
    let yMax = Math.max(...points.map((p) => yv(p[field])));
    if (log) {
      yMin = Math.floor(yMin);
      yMax = Math.ceil(yMax);
    } else {
      yMin = 0;
      yMax = Math.max(yMax * 1.25, 0.01);
    }
    const sx = (x: number) => pad.l + ((x - x0) / Math.max(x1 - x0, 1)) * (W - pad.l - pad.r);
    const sy = (y: number) => pad.t + (1 - (yv(y) - yMin) / Math.max(yMax - yMin, 1e-9)) * (H - pad.t - pad.b);
    const ticks = log ? Array.from({ length: yMax - yMin + 1 }, (_, i) => 10 ** (yMin + i)) : [0, yMax / 2, yMax];
    return { sx, sy, ticks };
  }, [points, field, log]);
  const { sx, sy, ticks } = geometry;
  const first = points[0];
  const last = points[points.length - 1];
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.time).toFixed(1)},${sy(p[field]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ width: "100%", height: "auto" }}>
      <text x={pad.l} y={14} fontSize={12} fill="currentColor">{title}</text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="currentColor" strokeOpacity={0.15} />
          <text x={pad.l - 6} y={sy(t) + 3} fontSize={10} fill="currentColor" fillOpacity={0.7} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} />
      {points.map((p) => (
        <circle key={p.block} cx={sx(p.time)} cy={sy(p[field])} r={4} fill="var(--bg)" stroke="var(--accent)" strokeWidth={2}>
          <title>{`${month(p.time)}, block ${p.block.toLocaleString("en-AU")}: ${fmt(p[field])}`}</title>
        </circle>
      ))}
      <text x={sx(first.time) + 6} y={sy(first[field]) - 8} fontSize={11} fill="currentColor">{fmt(first[field])}</text>
      <text x={sx(last.time) - 6} y={sy(last[field]) - 8} fontSize={11} fill="currentColor" textAnchor="end">{fmt(last[field])}</text>
      <text x={pad.l} y={H - 8} fontSize={10} fill="currentColor" fillOpacity={0.7}>{month(first.time)}</text>
      <text x={W - pad.r} y={H - 8} fontSize={10} fill="currentColor" fillOpacity={0.7} textAnchor="end">{month(last.time)}</text>
    </svg>
  );
}
