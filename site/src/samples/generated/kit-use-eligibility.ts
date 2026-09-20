export interface UseEligibilityOptions {
  /** Chain to read on. Defaults to wagmi's current chain. */
  chainId?: number;
  /** The network's permission contract. Defaults to the address in @gatedpath/chains for `chainId`. */
  permission?: Address;
  /** Refetch floor in milliseconds; the reads also refetch on every new block. Default 30 000. */
  refreshInterval?: number;
  /** Watch `eth_blockNumber` and refetch when it changes. Default true. */
  watchBlocks?: boolean;
  /**
   * When the verifier can tell: a function that returns the credential's expiry as a Unix time in
   * seconds, or null when unknown. `ReceptorMock` can; adapters over real verifiers cannot.
   * See `receptorMockExpiry`.
   */
  expiry?: (args: { address: Address; requestId: bigint }) => Promise<number | bigint | null>;
  /** How long before expiry the state turns to `expiring`. Default seven days. */
  expiringWindowSeconds?: number;
  /** Turn every read off (for example while a modal is closed). Default true. */
  enabled?: boolean;
}
