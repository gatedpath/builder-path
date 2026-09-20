#!/usr/bin/env node
// Transfers of one ERC-20 from Routescan, newest first. Read-only, keyless (paced at 2/s).
//   node scripts/routescan-transfers.mjs 0xToken --network mainnet --limit 50 [--json] [--from-block N]
import { createRoutescan, formatAmount } from '../src/routescan.mjs';
import { jsonReplacer, networkFrom, parseFlags, requireAddress, table, usage } from '../src/cli.mjs';

const SPEC = {
  network: { hint: 'mainnet|testnet', default: 'testnet', help: 'which Redbelly network (151 or 153 also accepted)' },
  limit: { hint: 'n', number: true, default: 50, help: 'how many transfers, newest first (100 per API page)' },
  'from-block': { hint: 'n', number: true, help: 'ignore transfers before this block' },
  'to-block': { hint: 'n', number: true, help: 'ignore transfers after this block' },
  'api-key': { hint: 'key', help: 'a free Routescan key raises the limit to 5/s; or ROUTESCAN_API_KEY' },
  json: { boolean: true, help: 'print JSON instead of a table' },
};

async function main(argv) {
  const { flags, positional } = parseFlags(argv, SPEC);
  if (flags.help || positional.length !== 1) {
    console.log(usage('redbelly-routescan-transfers', 'ERC-20 transfers of a contract from Routescan', SPEC, '<token-address>'));
    return positional.length === 1 ? 0 : 2;
  }
  const token = requireAddress(positional[0], 'token address');
  const network = networkFrom(flags);
  const rs = createRoutescan(network, { apiKey: flags['api-key'] ?? process.env.ROUTESCAN_API_KEY });
  const rows = await rs.tokenTransfers(token, { limit: flags.limit, fromBlock: flags['from-block'], toBlock: flags['to-block'] });
  if (flags.json) {
    console.log(JSON.stringify({ network, token, count: rows.length, apiCalls: rs.calls, transfers: rows }, jsonReplacer, 2));
    return 0;
  }
  const decimals = rows[0]?.tokenDecimal ?? 18;
  console.log(`${rows.length} transfer(s) of ${token} on ${network} (${rs.explorer.web}/token/${token}), newest first; ${rs.calls} API call(s)\n`);
  console.log(
    table(
      rows.map((r) => ({ block: r.blockNumber, time: r.timestamp, from: r.from, to: r.to, amount: formatAmount(r.value, decimals), tx: r.hash.slice(0, 18) + '…' })),
      ['block', 'time', 'from', 'to', 'amount', 'tx'],
    ),
  );
  return 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
