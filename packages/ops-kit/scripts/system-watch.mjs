#!/usr/bin/env node
// Watches the network's own contracts, because nobody announces when they change: what the
// bootstrap registry answers for permission, pricefeed and gasfees, what sits behind the
// permission proxy (implementation, proxy admin, the admin's owner), and the role and upgrade
// events on it. The first run keeps a baseline and says nothing; every later run posts each
// difference as JSON to ALERT_WEBHOOK_URL, in the same shape as redbelly-alert.
//
//   ALERT_WEBHOOK_URL=https://hooks.example/... node scripts/system-watch.mjs --network mainnet
//   node scripts/system-watch.mjs --network testnet --once --dry-run
//
// Read-only. No key. About a dozen RPC calls per pass, so the default interval is five minutes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRpc } from '@gatedpath/chains';
import { createFallbackRpc } from '../src/rpc-fallback.mjs';
import { explorerFor } from '../src/routescan.mjs';
import { isMain, networkFrom, parseFlags, usage } from '../src/cli.mjs';
import { takeSnapshot, watchOnce } from '../src/system-watch.mjs';

const SPEC = {
  network: { hint: 'mainnet|testnet', default: 'testnet', help: 'which chain to watch' },
  rpc: { hint: 'url', help: 'one RPC URL instead of the network providers (a private node, a test server)' },
  webhook: { hint: 'url', help: 'where to POST; prefer ALERT_WEBHOOK_URL so the URL stays out of shell history' },
  state: { hint: 'path', help: 'where the baseline and the last seen block are kept (default .redbelly-system-watch-<network>.json)' },
  interval: { hint: 'seconds', number: true, default: 300, help: 'time between passes' },
  once: { boolean: true, help: 'one pass, then exit (for cron or a test)' },
  'dry-run': { boolean: true, help: 'print changes instead of posting them' },
  json: { boolean: true, help: 'print each change as one JSON line (with --dry-run, or in addition to posting)' },
  show: { boolean: true, help: 'print the current snapshot as JSON and exit; touches no state file' },
};

function loadState(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(path, state) {
  mkdirSync(dirname(path) || '.', { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

async function post(webhook, alert) {
  const response = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(alert) });
  if (!response.ok) throw new Error(`webhook answered HTTP ${response.status}`);
}

async function main(argv) {
  const { flags } = parseFlags(argv, SPEC);
  if (flags.help) {
    console.log(usage('redbelly-system-watch', "watch the network's own contracts and post every change to a webhook", SPEC));
    return 0;
  }
  const network = networkFrom(flags);
  const rpc = flags.rpc ? createRpc(flags.rpc) : createFallbackRpc({ network, onEvent: (e) => console.error(`rpc failover: ${e.provider} failed for ${e.method}: ${e.error}`) });

  if (flags.show) {
    console.log(JSON.stringify(await takeSnapshot({ rpc, network }), null, 2));
    return 0;
  }

  const webhook = flags.webhook ?? (process.env.ALERT_WEBHOOK_URL || undefined);
  if (!webhook && !flags['dry-run']) {
    console.error('set ALERT_WEBHOOK_URL (or --webhook), or pass --dry-run');
    return 2;
  }
  const statePath = flags.state ?? `.redbelly-system-watch-${network}.json`;
  const state = loadState(statePath);
  if (state.snapshot && state.snapshot.network !== network) {
    console.error(`${statePath} holds a ${state.snapshot.network} baseline; use another --state for ${network}`);
    return 2;
  }
  const explorerUrl = explorerFor(network).web;

  const deliver = async (alert) => {
    if (flags['dry-run'] || flags.json) console.log(JSON.stringify(alert));
    if (!flags['dry-run']) await post(webhook, alert);
  };

  const tick = async () => {
    try {
      const { snapshot, alerts } = await watchOnce({ rpc, network, state, deliver, explorerUrl });
      saveState(statePath, state);
      if (alerts.length) console.error(`${new Date().toISOString()} block ${snapshot.block}: ${alerts.length} change(s) ${flags['dry-run'] ? 'printed' : 'posted'}`);
      return 0;
    } catch (error) {
      console.error(`${new Date().toISOString()} pass failed: ${error.message}`);
      return 1;
    }
  };

  const code = await tick();
  if (flags.once) return code;
  console.error(`watching the ${network} system contracts every ${flags.interval} s; state in ${statePath}`);
  setInterval(tick, flags.interval * 1000);
  return new Promise(() => {});
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => code !== undefined && process.exit(code), (e) => { console.error(e.message); process.exit(1); });
}
