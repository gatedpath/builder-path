#!/usr/bin/env node
// Read one ERC-3643 register, and where a wallet stands with it. Read-only, keyless.
//   node scripts/register.mjs 0xToken --network mainnet [--wallet 0x…] [--rpc https://…] [--json]
import { redbellyMainnet, redbellyTestnet, createRpc } from '@gatedpath/chains';
import { readRegister, describeRegister, NotARegister } from '../src/register.mjs';
import { jsonReplacer, networkFrom, parseFlags, requireAddress, usage } from '../src/cli.mjs';

const SPEC = {
  network: { hint: 'mainnet|testnet', default: 'testnet', help: 'which Redbelly network' },
  wallet: { hint: '0x…', help: 'a wallet to check against the register' },
  rpc: { hint: 'url', help: 'an RPC to use instead of the governors endpoint' },
  json: { boolean: true, help: 'print JSON instead of prose' },
};

async function main(argv) {
  const { flags, positional } = parseFlags(argv, SPEC);
  if (flags.help || positional.length !== 1) {
    console.log(usage('redbelly-register', 'read an ERC-3643 register and a wallet\'s standing with it', SPEC, '<token-address>'));
    return positional.length === 1 ? 0 : 2;
  }
  const token = requireAddress(positional[0], 'token address');
  const wallet = flags.wallet ? requireAddress(flags.wallet, 'wallet') : undefined;
  const network = networkFrom(flags);
  const url = flags.rpc ?? (network === 'mainnet' ? redbellyMainnet : redbellyTestnet).rpcUrls.default.http[0];
  const rpc = createRpc(url);
  try {
    const r = await readRegister({ rpc, token, wallet });
    if (flags.json) console.log(JSON.stringify({ network, ...r }, jsonReplacer, 2));
    else console.log(describeRegister(r).join('\n'));
    return 0;
  } catch (e) {
    if (e instanceof NotARegister) {
      console.error(e.message);
      return 3;
    }
    throw e;
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
