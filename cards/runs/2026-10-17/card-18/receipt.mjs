#!/usr/bin/env node
// Exports the receipt log of one distribution from the chain's events, read-only.
//
//   node scripts/receipt.mjs --rpc <url> --distributor <address> --id <n> --from <block> [--out receipt.csv]
//
// Reads Opened, Paid, Skipped, PaymentFailed, Completed and Closed for the id from the distributor's log,
// windowed at 100 blocks per eth_getLogs like holders.mjs, and writes one CSV row per holder with the
// transaction hash that paid it (or the reason it was not paid), plus a JSON summary beside it. The
// administrator keeps this as the record of the distribution date. Nothing here signs anything.

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const WINDOW = 100;
const SIG = {
  Opened: 'Opened(uint256,address,address,address,uint256,uint256,uint256,uint256)',
  Paid: 'Paid(uint256,address,uint256,uint256)',
  Skipped: 'Skipped(uint256,address)',
  PaymentFailed: 'PaymentFailed(uint256,address,uint256,bytes)',
  Completed: 'Completed(uint256,uint256,uint256,uint256,uint256)',
  Closed: 'Closed(uint256)',
};

function parseArgs(argv) {
  const opts = { rpc: 'http://127.0.0.1:8558', distributor: null, id: null, from: null, out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--rpc') opts.rpc = value;
    else if (flag === '--distributor') opts.distributor = value;
    else if (flag === '--id') opts.id = BigInt(value);
    else if (flag === '--from') opts.from = Number(value);
    else if (flag === '--out') opts.out = value;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!opts.distributor || opts.id === null || opts.from === null) throw new Error('--distributor, --id and --from are required');
  return opts;
}

let nextId = 1;
async function rpcCall(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

// keccak256 over the signature without a dependency: the Web Crypto API has no keccak, so the event topics
// come from Foundry's cast, which this project already requires.
function topic(sig) {
  return execFileSync('cast', ['keccak', sig]).toString().trim();
}

const hex = (n) => '0x' + n.toString(16);
const word = (data, i) => BigInt('0x' + data.slice(2 + i * 64, 2 + (i + 1) * 64));
const addr = (t) => '0x' + t.slice(26);
const padId = (id) => '0x' + id.toString(16).padStart(64, '0');

function decodeReason(data) {
  // (uint256 amount, bytes reason): word 0 amount, word 1 offset, then length and bytes
  const amount = word(data, 0);
  const offset = Number(word(data, 1));
  const length = Number(BigInt('0x' + data.slice(2 + offset * 2, 2 + offset * 2 + 64)));
  const raw = data.slice(2 + offset * 2 + 64, 2 + offset * 2 + 64 + length * 2);
  // an Error(string) revert is 0x08c379a0 + abi string; anything else is kept as hex
  let text = '0x' + raw;
  if (raw.startsWith('08c379a0')) {
    const s = raw.slice(8);
    const len = Number(BigInt('0x' + s.slice(64, 128)));
    text = Buffer.from(s.slice(128, 128 + len * 2), 'hex').toString('utf8');
  } else if (/^[0-9a-f]*$/.test(raw) && raw.length > 0 && Buffer.from(raw, 'hex').toString('utf8').match(/^[\x20-\x7e]+$/)) {
    text = Buffer.from(raw, 'hex').toString('utf8');
  }
  return { amount, reason: text };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const topics = Object.fromEntries(Object.entries(SIG).map(([k, s]) => [k, topic(s)]));
  const byTopic = Object.fromEntries(Object.entries(topics).map(([k, t]) => [t, k]));
  const latest = Number(BigInt(await rpcCall(opts.rpc, 'eth_blockNumber', [])));
  const logs = [];
  for (let b = opts.from; b <= latest; b += WINDOW) {
    const got = await rpcCall(opts.rpc, 'eth_getLogs', [
      { address: opts.distributor, fromBlock: hex(b), toBlock: hex(Math.min(b + WINDOW - 1, latest)), topics: [Object.values(topics), padId(opts.id)] },
    ]);
    logs.push(...got);
  }

  const summary = { distributor: opts.distributor, id: opts.id.toString(), rpc: opts.rpc, readAtBlock: latest, rows: [] };
  const rows = [];
  for (const log of logs) {
    const kind = byTopic[log.topics[0]];
    const block = Number(BigInt(log.blockNumber));
    if (kind === 'Opened') {
      summary.opened = {
        block,
        tx: log.transactionHash,
        payer: addr(log.topics[2]),
        stablecoin: addr(log.topics[3]),
        register: addr('0x' + log.data.slice(2, 66)),
        snapshotBlock: word(log.data, 1).toString(),
        total: word(log.data, 2).toString(),
        holderCount: word(log.data, 3).toString(),
        totalBalance: word(log.data, 4).toString(),
      };
    } else if (kind === 'Paid') {
      rows.push({ holder: addr(log.topics[2]), status: 'Paid', amount: word(log.data, 0).toString(), snapshotBalance: word(log.data, 1).toString(), block, tx: log.transactionHash, reason: '' });
    } else if (kind === 'Skipped') {
      rows.push({ holder: addr(log.topics[2]), status: 'Skipped', amount: '0', snapshotBalance: '0', block, tx: log.transactionHash, reason: 'zero balance at the snapshot' });
    } else if (kind === 'PaymentFailed') {
      const { amount, reason } = decodeReason(log.data);
      rows.push({ holder: addr(log.topics[2]), status: 'Failed', amount: amount.toString(), snapshotBalance: '', block, tx: log.transactionHash, reason });
    } else if (kind === 'Completed') {
      summary.completed = { block, tx: log.transactionHash, paid: word(log.data, 0).toString(), paidCount: word(log.data, 1).toString(), failedCount: word(log.data, 2).toString(), dust: word(log.data, 3).toString() };
    } else if (kind === 'Closed') {
      summary.closed = { block, tx: log.transactionHash };
    }
  }
  // a retry that succeeds leaves an earlier Failed row for the same holder; the latest row wins
  const latestByHolder = new Map();
  for (const r of rows) latestByHolder.set(r.holder, r);
  summary.rows = [...latestByHolder.values()];
  summary.rowCount = summary.rows.length;

  const csv = ['holder,status,amount,snapshot_balance,block,tx,reason', ...summary.rows.map((r) => [r.holder, r.status, r.amount, r.snapshotBalance, r.block, r.tx, JSON.stringify(r.reason)].join(','))].join('\n') + '\n';
  if (opts.out) {
    writeFileSync(opts.out, csv);
    writeFileSync(opts.out.replace(/\.csv$/, '') + '.json', JSON.stringify(summary, null, 2) + '\n');
    process.stderr.write(`[receipt] ${summary.rows.length} rows written to ${opts.out} (and .json)\n`);
  } else {
    process.stdout.write(csv);
  }
}

main().catch((e) => {
  process.stderr.write(`[receipt] ${e.message}\n`);
  process.exit(1);
});
