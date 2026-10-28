// What the fee checker reads and prices. Every address and selector comes from
// packages/chain-definitions; the reference gas figures are measured, with the run that measured
// each one named beside it, and are never typed from a document.
import { STATUS_CHAINS, GET_LATEST_PRICE, PRICE_FEED_DECIMALS, type StatusChain } from './status';

export { GET_LATEST_PRICE, PRICE_FEED_DECIMALS };
export type { StatusChain };
export const FEE_CHAINS = STATUS_CHAINS;

/** The network prices gas in US dollars: Vine's figure, measured in RESEARCH.md question 3 (US$0.01 for a 21,000-gas transfer). */
export const USD_PER_GAS = 0.01 / 21_000;

export interface ReferenceCall {
  key: string;
  label: string;
  gas: number;
  /** Where the gas figure comes from, with the date. */
  measured: string;
}

/** Calls a builder meets, with gas as measured, oldest measurement last. */
export const REFERENCE_CALLS: ReferenceCall[] = [
  { key: 'transfer', label: 'A native transfer', gas: 21_000, measured: 'the EVM constant; Vine prices it at US$0.01' },
  { key: 'guard', label: 'Deploying the recipient guard (project 13)', gas: 503_685, measured: 'measured on 153, 17 October 2026, block 3,052,324' },
  { key: 'token', label: 'Deploying the gated token (the scaffold)', gas: 1_971_486, measured: 'the ship report on 153, 17 October 2026' },
  { key: 'enable', label: 'Enabling a wallet on the network', gas: 2_154_375, measured: 'measured on 151, 17 October 2026, block 3,228,354' },
];

/** Mainnet block heights sampled for the history: genesis week, then roughly every four months to the head. */
export const HISTORY_BLOCKS_151: number[] = [204, 400_000, 800_000, 1_200_000, 1_600_000, 2_000_000, 2_400_000, 2_800_000, 3_100_000];

/** The call the history is drawn for. */
export const HISTORY_GAS = 2_154_375;
