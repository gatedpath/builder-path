// What the live status page reads, per chain. Every URL, address and selector comes from
// packages/chain-definitions (verified 2026-09-12); nothing is retyped here. The same object
// is used at build time (the Astro frontmatter reads the RPC once) and in the browser (the
// visitor's own fetch), so the two can never disagree about where to look.
import { addresses } from '../../../packages/chain-definitions/src/addresses';
import { redbellyMainnet, redbellyTestnet } from '../../../packages/chain-definitions/src/chains';
import { selectors } from '../../../packages/chain-definitions/src/abi';
import { LINKS } from './site';

export interface StatusChain {
  id: number;
  key: '151' | '153';
  name: string;
  short: string;
  rpc: string;
  explorer: string;
  pricefeed: `0x${string}`;
  faucet: string | null;
}

export const STATUS_CHAINS: StatusChain[] = [
  {
    id: redbellyMainnet.id,
    key: '151',
    name: redbellyMainnet.name,
    short: 'Mainnet 151',
    rpc: redbellyMainnet.rpcUrls.default.http[0]!,
    explorer: redbellyMainnet.blockExplorers.default.url,
    pricefeed: addresses.mainnet.pricefeed.address,
    faucet: null,
  },
  {
    id: redbellyTestnet.id,
    key: '153',
    name: redbellyTestnet.name,
    short: 'Testnet 153',
    rpc: redbellyTestnet.rpcUrls.default.http[0]!,
    explorer: redbellyTestnet.blockExplorers.default.url,
    pricefeed: addresses.testnet.pricefeed.address,
    faucet: LINKS.faucet,
  },
];

/** `getLatestPrice()` on the price feed, ABI from Vine's network-fees page. */
export const GET_LATEST_PRICE = selectors.getLatestPrice;

/** How many recent blocks the interval is measured over, the way phase-0/measure-blocktime.mjs measures it. */
export const INTERVAL_BLOCKS = 25;

/** Gas of a native transfer; Vine prices it at US$0.01. */
export const TRANSFER_GAS = 21_000;

/** The price feed's decimals, measured on both chains (RESEARCH.md question 6, chain-definitions). */
export const PRICE_FEED_DECIMALS = 6;
