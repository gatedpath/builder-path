#!/usr/bin/env node
// Alerting recipe: poll eth_getLogs on a GatedERC20 for the events an operator must hear about
// (pause and unpause, forced transfers, role changes, verifier and request-id changes, plus
// issuer permissions and skipped distributions at lower severity) and POST each one as JSON to
// a webhook. The webhook URL comes from ALERT_WEBHOOK_URL and is never printed. The last block
// seen is kept in a small state file so a restart does not re-alert or miss a block.
//
//   ALERT_WEBHOOK_URL=https://hooks.example/... node scripts/alert.mjs --contract 0x... --network mainnet
//   node scripts/alert.mjs --contract 0x... --rpc http://127.0.0.1:8545 --once --dry-run
//
// Read-only. Uses the fallback RPC helper on mainnet (governors, Ankr, Uniblock with a key).
// Blocks on Redbelly are produced on demand, so a quiet contract produces no logs and no
// requests beyond one eth_blockNumber per poll.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRpc } from '@gatedpath/chains';
import { createFallbackRpc } from '../src/rpc-fallback.mjs';
import { decodeLog, WATCHED_EVENTS } from '../src/events.mjs';
import { explorerFor } from '../src/routescan.mjs';
import { LOG_WINDOW } from '../src/system-watch.mjs';
import { isMain, networkFrom, parseFlags, requireAddress, usage } from '../src/cli.mjs';

const SPEC = {
  contract: { hint: '0x…', help: 'the GatedERC20 (or any contract emitting these events) to watch' },
  network: { hint: 'mainnet|testnet', default: 'testnet', help: 'picks the RPC providers and the explorer link' },
  rpc: { hint: 'url', help: 'one RPC URL instead of the network providers (a local anvil, a private node)' },
  webhook: { hint: 'url', help: 'where to POST; prefer ALERT_WEBHOOK_URL so the URL stays out of shell history' },
  state: { hint: 'path', default: '.redbelly-alert-state.json', help: 'where the last seen block is kept' },
  'from-block': { hint: 'n', number: true, help: 'start here on first run (default: the current head, so only new events alert)' },
  interval: { hint: 'seconds', number: true, default: 15, help: 'poll interval' },
  'min-severity': { hint: 'info|warning|critical', default: 'warning', help: 'lowest severity to post' },
  once: { boolean: true, help: 'one poll, then exit (for cron or a test)' },
  'dry-run': { boolean: true, help: 'print alerts instead of posting them' },
  json: { boolean: true, help: 'print each alert as one JSON line (with --dry-run, or in addition to posting)' },
};

const SEVERITY = { info: 0, warning: 1, critical: 2 };

function loadState(path) {
  if (!existsSync(path)) return { lastBlock: null };
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { lastBlock: null };
  }
}

function saveState(path, state) {
  mkdirSync(dirname(path) || '.', { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

async function post(webhook, alert, doFetch = globalThis.fetch) {
  const response = await doFetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(alert),
  });
  if (!response.ok) throw new Error(`webhook answered HTTP ${response.status}`);
}

export async function pollOnce({ rpc, contract, network, explorerUrl, state, minSeverity, deliver, log = console.error }) {
  const head = Number(BigInt(await rpc('eth_blockNumber')));
  if (state.lastBlock === null) {
    state.lastBlock = head;
    log(`starting at block ${head}; only events after it will alert`);
    return { head, alerts: [] };
  }
  if (head <= state.lastBlock) return { head, alerts: [] };
  // Read in windows. The governors RPC accepts about 100 blocks per eth_getLogs and refuses 250
  // (measured 2026-09-15; system-watch has always windowed). One request for the whole gap meant
  // that after about 90 minutes of downtime every tick asked for the same oversized range, failed,
  // and never advanced: silent for good (audit of 2026-09-19). The place is kept per window, after
  // its alerts are delivered, so a failure part-way loses nothing and repeats nothing already sent.
  const alerts = [];
  for (let start = state.lastBlock + 1; start <= head; start += LOG_WINDOW) {
    const end = Math.min(start + LOG_WINDOW - 1, head);
    const logs = await rpc('eth_getLogs', [
      { address: contract, fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16), topics: [WATCHED_EVENTS.map((e) => e.topic)] },
    ]);
    const batch = [];
    for (const raw of logs) {
      let alert;
      try {
        alert = decodeLog(raw, { network, contract, explorerUrl });
      } catch (error) {
        // One log that cannot be read must not take the rest with it (a legal `validUntil` of
        // 2^64-1 once did, every poll). The operator hears about it, at the top severity.
        alert = undecodable(raw, error, { network, contract, explorerUrl });
      }
      if (!alert || SEVERITY[alert.severity] < SEVERITY[minSeverity]) continue;
      batch.push(alert);
    }
    for (const alert of batch) await deliver(alert);
    alerts.push(...batch);
    state.lastBlock = end;
  }
  return { head, alerts };
}

/** An alert for a watched event whose data could not be decoded. Carries no decoded arguments. */
function undecodable(raw, error, { network, contract, explorerUrl }) {
  return {
    network: network ?? null,
    contract: contract ?? raw.address,
    event: 'DecodeFailed',
    severity: 'critical',
    what: `a watched event (topic ${raw.topics?.[0] ?? 'unknown'}) could not be decoded: ${error.message}; read the transaction by hand`,
    blockNumber: Number(raw.blockNumber),
    transactionHash: raw.transactionHash,
    logIndex: Number(raw.logIndex ?? 0),
    args: {},
    explorerUrl: explorerUrl ? `${explorerUrl}/tx/${raw.transactionHash}` : null,
  };
}

async function main(argv) {
  const { flags } = parseFlags(argv, SPEC);
  if (flags.help || !flags.contract) {
    console.log(usage('redbelly-alert', 'poll a gated ERC-20 for operator events and post them to a webhook', SPEC));
    return flags.help ? 0 : 2;
  }
  const contract = requireAddress(flags.contract, '--contract');
  const network = networkFrom(flags);
  const webhook = flags.webhook ?? process.env.ALERT_WEBHOOK_URL;
  if (!webhook && !flags['dry-run']) {
    console.error('set ALERT_WEBHOOK_URL (or --webhook), or pass --dry-run');
    return 2;
  }
  if (!(flags['min-severity'] in SEVERITY)) {
    console.error('--min-severity must be info, warning or critical');
    return 2;
  }
  const rpc = flags.rpc ? createRpc(flags.rpc) : createFallbackRpc({ network, onEvent: (e) => console.error(`rpc failover: ${e.provider} failed for ${e.method}: ${e.error}`) });
  const explorerUrl = explorerFor(network).web;
  const state = loadState(flags.state);
  if (state.lastBlock === null && flags['from-block'] !== undefined) state.lastBlock = flags['from-block'] - 1;

  const deliver = async (alert) => {
    const line = JSON.stringify(alert);
    if (flags['dry-run'] || flags.json) console.log(line);
    if (!flags['dry-run']) await post(webhook, alert);
  };

  const tick = async () => {
    try {
      const { head, alerts } = await pollOnce({ rpc, contract, network, explorerUrl, state, minSeverity: flags['min-severity'], deliver });
      saveState(flags.state, state);
      if (alerts.length) console.error(`${new Date().toISOString()} block ${head}: ${alerts.length} alert(s) ${flags['dry-run'] ? 'printed' : 'posted'}`);
      return true;
    } catch (error) {
      saveState(flags.state, state); // the windows that did finish are not read again
      console.error(`${new Date().toISOString()} poll failed: ${error.message}`);
      return false;
    }
  };

  const ok = await tick();
  if (flags.once) return ok ? 0 : 1; // a scheduler must see a failed poll as a failure
  console.error(`watching ${contract} on ${network} every ${flags.interval} s; state in ${flags.state}`);
  setInterval(tick, flags.interval * 1000);
  return new Promise(() => {});
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => code !== undefined && process.exit(code), (e) => { console.error(e.message); process.exit(1); });
}
