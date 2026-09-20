import type { PublicClient } from 'viem';
import { receptorMockAbi } from './abi.js';
import type { Address } from './useEligibility.js';

/**
 * An `expiry` reader for `useEligibility` that works when the verifier is a `ReceptorMock`
 * (testnet and forks). It reads `recordFor(wallet, requestId).expiresAt`; zero means no expiry.
 * Real verifiers (an Iden3 `ZKPVerifier` child, a `VCVerifierBaseContract` child) do not expose
 * an expiry, so on mainnet leave `expiry` unset and the `expiring` state never shows.
 */
export function receptorMockExpiry(client: PublicClient, verifier: Address) {
  return async ({ address, requestId }: { address: Address; requestId: bigint }): Promise<number | null> => {
    const record = await client.readContract({
      address: verifier,
      abi: receptorMockAbi,
      functionName: 'recordFor',
      args: [address, requestId],
    });
    const expiresAt = Number(record.expiresAt);
    return record.isSet && expiresAt > 0 ? expiresAt : null;
  };
}
