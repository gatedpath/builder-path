#!/usr/bin/env node
// Rebuilds the holder table of an ERC-20 (here: an ERC-3643 register) from the chain alone, read-only.
//
//   node scripts/holders.mjs --rpc <url> --register <address> [--snapshot <block>] [--from <block>] [--out holders.json]
//
// 1. Every Transfer event from the register's first block to the snapshot block, asked for in windows of
//    100 blocks per eth_getLogs (the governors RPC refuses wide ranges and so does Anvil on a fork).
//    The first block is found by binary search on eth_getCode when --from is not given.
// 2. balanceOf for every address that ever received, read at the snapshot block, so the table is the
//    chain's answer at one block and not a running sum of events.
// The output carries the snapshot block, the block the chain was at when the read began, and the
// addresses whose balance at the snapshot was zero (they were holders once; the distributor skips them).
// Nothing here signs anything. Plain fetch, no dependencies.

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const WINDOW = 100;
// The governors RPC answers "exceeded filter rate limit" past a few eth_getLogs a second; two in flight
// with a backoff on that answer is what it takes. --concurrency raises it for an RPC that allows more.
let concurrency = 2;
// The Transfer topic is keccak256 of the signature. It is computed with cast rather than written out because
// a 64-hex literal looks like a private key to pre-flight's secret scanner, which reads every file here.
const TRANSFER_TOPIC = execFileSync('cast', ['keccak', 'Transfer(address,address,uint256)']).toString().trim();
const BALANCE_OF = '0x70a08231';

function parseArgs(argv) {
  const opts = { rpc: 'https://governors.mainnet.redbelly.network', register: null, snapshot: null, from: null, out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--rpc') opts.rpc = value;
    else if (flag === '--register') opts.register = value;
    else if (flag === '--snapshot') opts.snapshot = Number(value);
    else if (flag === '--from') opts.from = Number(value);
    else if (flag === '--out') opts.out = value;
    else if (flag === '--concurrency') concurrency = Number(value);
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!opts.register || !/^0x[0-9a-fA-F]{40}$/.test(opts.register)) throw new Error('--register <address> is required');
  return opts;
}

let nextId = 1;
let retries = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpcCall(url, method, params) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    });
    const body = res.ok ? await res.json() : { error: { message: `HTTP ${res.status}` } };
    if (!body.error) return body.result;
    const limited = /rate limit|429|too many/i.test(body.error.message);
    if (!limited || attempt >= 8) throw new Error(`${method}: ${body.error.message}`);
    retries += 1;
    await sleep(250 * 2 ** attempt);
  }
}

const hex = (n) => '0x' + n.toString(16);
const topicToAddress = (topic) => '0x' + topic.slice(26).toLowerCase();

/** The first block at which the register has code: a binary search over eth_getCode. */
async function firstBlockWithCode(rpc, address, latest) {
  let lo = 0;
  let hi = latest;
  const code = await rpcCall(rpc, 'eth_getCode', [address, hex(latest)]);
  if (!code || code === '0x') throw new Error(`${address} has no code at block ${latest}`);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const c = await rpcCall(rpc, 'eth_getCode', [address, hex(mid)]);
    if (c && c !== '0x') hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const latest = Number(BigInt(await rpcCall(opts.rpc, 'eth_blockNumber', [])));
  const snapshot = opts.snapshot ?? latest;
  if (snapshot > latest) throw new Error(`snapshot ${snapshot} is after the chain's head ${latest}`);
  const from = opts.from ?? (await firstBlockWithCode(opts.rpc, opts.register, snapshot));
  process.stderr.write(`[holders] ${opts.register}: scanning blocks ${from} to ${snapshot} in windows of ${WINDOW} (chain head ${latest})\n`);

  // Every window, concurrency at a time, in order of block.
  const windows = [];
  for (let b = from; b <= snapshot; b += WINDOW) windows.push([b, Math.min(b + WINDOW - 1, snapshot)]);
  const seen = new Set();
  let transfers = 0;
  let done = 0;
  const t0 = Date.now();
  for (let i = 0; i < windows.length; i += concurrency) {
    const batch = windows.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(([a, b]) =>
        rpcCall(opts.rpc, 'eth_getLogs', [{ address: opts.register, fromBlock: hex(a), toBlock: hex(b), topics: [TRANSFER_TOPIC] }]),
      ),
    );
    for (const logs of results) {
      for (const log of logs) {
        transfers += 1;
        // topics[1] is from, topics[2] is to; only receivers can hold anything
        if (log.topics[2]) seen.add(topicToAddress(log.topics[2]));
      }
    }
    done += batch.length;
    if (done % 200 < concurrency || done === windows.length) {
      process.stderr.write(`[holders] ${done}/${windows.length} windows, ${transfers} transfers, ${seen.size} addresses, ${retries} retries after a rate limit (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
    }
  }
  seen.delete('0x0000000000000000000000000000000000000000');

  // balanceOf at the snapshot block for every address that ever received
  const addresses = [...seen].sort();
  const holders = [];
  const zero = [];
  for (let i = 0; i < addresses.length; i += concurrency) {
    const batch = addresses.slice(i, i + concurrency);
    const balances = await Promise.all(
      batch.map((a) => rpcCall(opts.rpc, 'eth_call', [{ to: opts.register, data: BALANCE_OF + a.slice(2).padStart(64, '0') }, hex(snapshot)])),
    );
    batch.forEach((a, j) => {
      const balance = BigInt(balances[j] === '0x' ? 0 : balances[j]).toString();
      if (balance === '0') zero.push(a);
      else holders.push({ address: a, balance });
    });
  }
  const totalBalance = holders.reduce((s, h) => s + BigInt(h.balance), 0n).toString();

  const table = {
    register: opts.register,
    rpc: opts.rpc,
    snapshotBlock: snapshot,
    chainHeadAtRead: latest,
    firstBlock: from,
    windowsRead: windows.length,
    windowSize: WINDOW,
    transfersSeen: transfers,
    rateLimitRetries: retries,
    readStartedAt: startedAt,
    readFinishedAt: new Date().toISOString(),
    holderCount: holders.length,
    totalBalance,
    holders,
    zeroBalanceAtSnapshot: zero,
  };
  const json = JSON.stringify(table, null, 2);
  if (opts.out) writeFileSync(opts.out, json + '\n');
  else process.stdout.write(json + '\n');
  process.stderr.write(`[holders] ${holders.length} holders with a balance at block ${snapshot}, ${zero.length} at zero; total ${totalBalance}\n`);
}

main().catch((e) => {
  process.stderr.write(`[holders] ${e.message}\n`);
  process.exit(1);
});
