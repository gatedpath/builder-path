// Answers open question 4: what "block time" actually is on this network, measured,
// not quoted. Polls the RPC and records every new block for a duration.
// Usage: node measure-blocktime.mjs [testnet|mainnet] [minutes=30]
// Leave it for 24 hours once to get a defensible number.
import { rpc, num, pickEnv, median, percentile } from './rpc.mjs';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const env = pickEnv(args);
const minutes = Number(args.find((a) => /^\d+(\.\d+)?$/.test(a)) || 30);
const until = Date.now() + minutes * 60_000;
const file = `results/blocktime-${env.name}-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`;

const blocks = [];
let last = null;
console.log(`Measuring ${env.name} for ${minutes} min. Writing ${file} as it goes.\n`);

while (Date.now() < until) {
  try {
    const b = await rpc(env.rpc, 'eth_getBlockByNumber', ['latest', false]);
    const n = num(b.number);
    if (last == null || n > last) {
      if (last != null && n > last + 1) {
        // fetch skipped blocks so intervals are not distorted by slow polling
        for (let k = last + 1; k < n; k++) {
          const s = await rpc(env.rpc, 'eth_getBlockByNumber', ['0x' + k.toString(16), false]);
          blocks.push({ number: k, timestamp: num(s.timestamp), seenAt: null, txCount: s.transactions.length, gasUsed: num(s.gasUsed) });
        }
      }
      blocks.push({ number: n, timestamp: num(b.timestamp), seenAt: Date.now(), txCount: b.transactions.length, gasUsed: num(b.gasUsed) });
      last = n;
      const row = blocks.at(-1);
      console.log(`${new Date().toISOString()} block ${n} ts=${row.timestamp} txs=${row.txCount}`);
      writeFileSync(file, JSON.stringify(summarise(), null, 2));
    }
  } catch (e) {
    console.log(`${new Date().toISOString()} poll error: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

function summarise() {
  const ts = blocks.map((b) => b.timestamp);
  const chainIntervals = ts.slice(1).map((t, i) => t - ts[i]);
  const seen = blocks.filter((b) => b.seenAt).map((b) => b.seenAt);
  const wallIntervals = seen.slice(1).map((t, i) => (t - seen[i]) / 1000);
  return {
    env: env.name, rpc: env.rpc, minutes, startedAt: new Date(until - minutes * 60_000).toISOString(),
    blocksObserved: blocks.length,
    firstBlock: blocks[0]?.number, lastBlock: blocks.at(-1)?.number,
    intervalByBlockTimestampSec: { median: median(chainIntervals), p95: percentile(chainIntervals, 95), min: Math.min(...chainIntervals), max: Math.max(...chainIntervals) },
    intervalByWallClockSec: { median: median(wallIntervals), p95: percentile(wallIntervals, 95) },
    emptyBlockRatio: blocks.length ? blocks.filter((b) => b.txCount === 0).length / blocks.length : null,
    txPerBlock: { median: median(blocks.map((b) => b.txCount)), max: Math.max(...blocks.map((b) => b.txCount)) },
    note: 'Block interval is not transaction finality latency. Measure inclusion latency separately with a funded, verified wallet: `cast send` a self-transfer and time until the receipt appears.',
    blocks,
  };
}

console.log('\nSummary:');
const s = summarise();
delete s.blocks;
console.log(JSON.stringify(s, null, 2));
