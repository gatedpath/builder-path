#!/usr/bin/env node
// Holders of one ERC-20 from Routescan's native listing, largest first. Read-only, keyless.
//   node scripts/routescan-holders.mjs 0xToken --network mainnet --limit 25 [--decimals 18] [--json]
import { createRoutescan, formatAmount } from '../src/routescan.mjs';
import { jsonReplacer, networkFrom, parseFlags, requireAddress, table, usage } from '../src/cli.mjs';

const SPEC = {
  network: { hint: 'mainnet|testnet', default: 'testnet', help: 'which Redbelly network' },
  limit: { hint: 'n', number: true, default: 25, help: 'how many holders, largest first' },
  decimals: { hint: 'n', number: true, default: 18, help: 'token decimals for the amount column' },
  json: { boolean: true, help: 'print JSON instead of a table' },
};

async function main(argv) {
  const { flags, positional } = parseFlags(argv, SPEC);
  if (flags.help || positional.length !== 1) {
    console.log(usage('redbelly-routescan-holders', 'holders of an ERC-20 from Routescan', SPEC, '<token-address>'));
    return positional.length === 1 ? 0 : 2;
  }
  const token = requireAddress(positional[0], 'token address');
  const network = networkFrom(flags);
  const rs = createRoutescan(network);
  const rows = await rs.holders(token, { limit: flags.limit });
  if (flags.json) {
    console.log(JSON.stringify({ network, token, count: rows.length, apiCalls: rs.calls, holders: rows }, jsonReplacer, 2));
    return 0;
  }
  console.log(`${rows.length} holder(s) of ${token} on ${network} (${rs.explorer.web}/token/${token}), largest first; ${rs.calls} API call(s)\n`);
  console.log(
    table(
      rows.map((r) => ({ holder: r.address, balance: formatAmount(r.balance, flags.decimals), share: r.share === null ? '' : (r.share * 100).toFixed(2) + '%' })),
      ['holder', 'balance', 'share'],
    ),
  );
  console.log('\nA holder list from an explorer is a snapshot of Transfer events it indexed; for a gated token the on-chain truth is balanceOf, and eligibility is a separate read (isEligible).');
  return 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
