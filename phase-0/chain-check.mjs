// Answers: does the RPC agree on chain ID, what client runs it, what does the fee
// model look like from the outside, which JSON-RPC methods exist.
// Usage: node chain-check.mjs [testnet|mainnet]
import { rpc, num, big, pickEnv } from './rpc.mjs';
import { writeFileSync } from 'node:fs';

const env = pickEnv(process.argv.slice(2));
const out = { env: env.name, rpc: env.rpc, checkedAt: new Date().toISOString(), results: {} };

async function probe(label, method, params = [], fmt = (x) => x) {
  try {
    const r = await rpc(env.rpc, method, params);
    out.results[label] = { ok: true, value: fmt(r) };
    console.log(`${label.padEnd(28)} ${JSON.stringify(fmt(r))}`);
  } catch (e) {
    out.results[label] = { ok: false, error: e.message };
    console.log(`${label.padEnd(28)} ERROR ${e.message}`);
  }
}

console.log(`\n== ${env.name} (${env.rpc}) ==\n`);
await probe('eth_chainId', 'eth_chainId', [], (h) => ({ reported: num(h), expected: env.chainId, match: num(h) === env.chainId }));
await probe('web3_clientVersion', 'web3_clientVersion');
await probe('net_version', 'net_version');
await probe('eth_blockNumber', 'eth_blockNumber', [], num);
await probe('eth_gasPrice (wei)', 'eth_gasPrice', [], (h) => big(h).toString());
await probe('eth_maxPriorityFeePerGas', 'eth_maxPriorityFeePerGas', [], (h) => big(h).toString());
await probe('eth_feeHistory(4)', 'eth_feeHistory', ['0x4', 'latest', [25, 50, 75]], (r) => ({
  baseFeePerGas: r.baseFeePerGas?.map((h) => big(h).toString()),
  gasUsedRatio: r.gasUsedRatio,
  rewardSample: r.reward?.[0]?.map((h) => big(h).toString()),
}));
await probe('latest block', 'eth_getBlockByNumber', ['latest', false], (b) => ({
  number: num(b.number),
  timestamp: num(b.timestamp),
  txCount: b.transactions.length,
  gasLimit: num(b.gasLimit),
  gasUsed: num(b.gasUsed),
  baseFeePerGas: b.baseFeePerGas ? big(b.baseFeePerGas).toString() : null,
  hasWithdrawals: 'withdrawals' in b,
  hasBlobGasUsed: 'blobGasUsed' in b,
  hasParentBeaconBlockRoot: 'parentBeaconBlockRoot' in b,
  hasRequestsHash: 'requestsHash' in b,
  miner: b.miner,
  extraDataLen: (b.extraData?.length ?? 2) / 2 - 1,
}));
await probe('eth_syncing', 'eth_syncing');
await probe('txpool_status', 'txpool_status');
await probe('eth_getLogs (last block)', 'eth_getLogs', [{ fromBlock: 'latest', toBlock: 'latest' }], (r) => ({ count: r.length }));
await probe('debug_traceBlockByNumber', 'debug_traceBlockByNumber', ['latest', { tracer: 'callTracer' }], (r) => ({ supported: true, entries: r?.length }));
await probe('trace_block', 'trace_block', ['latest'], (r) => ({ supported: true, entries: r?.length }));

const file = `results/chain-check-${env.name}-${out.checkedAt.slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nSaved ${file}`);
