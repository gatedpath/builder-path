// Compiled by `npm run check:viem` only. Proves the chain objects satisfy viem's Chain
// type and that viem's own checksum agrees with ours for every recorded address.
import type { Chain } from 'viem';
import { getAddress } from 'viem';
import { redbellyMainnet, redbellyTestnet, addresses, checksumAddress } from '../src/index.js';

const a: Chain = redbellyMainnet;
const b: Chain = redbellyTestnet;
void a;
void b;

for (const net of Object.values(addresses)) {
  for (const entry of Object.values(net)) {
    if (getAddress(entry.address) !== checksumAddress(entry.address)) throw new Error(`checksum mismatch ${entry.address}`);
  }
}
