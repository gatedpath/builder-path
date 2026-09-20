'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBlockNumber, useChainId, useReadContract } from 'wagmi';
import { chainById } from '@gatedpath/chains';
import { permissionAbi, verifierAbi } from './abi.js';
import { onEligibilityChanged } from './events.js';

export type Address = `0x${string}`;

/** The five UI states, plus the two every real page also has. */
export type EligibilityState =
  | 'disconnected'
  | 'checking'
  | 'unverified'
  | 'ineligible'
  | 'eligible'
  | 'expiring'
  | 'error';

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

export interface EligibilityResult {
  state: EligibilityState;
  /** `permission.isAllowed(address)`: the wallet has been through access.redbelly.network. */
  isAllowed: boolean | undefined;
  /** `verifier.isEligible(address, requestId)`: the wallet passes this action's gate. */
  isEligible: boolean | undefined;
  /** Unix seconds when the credential expires, when the verifier can tell. */
  expiresAt: number | null;
  /** Seconds until expiry, when known. */
  secondsToExpiry: number | null;
  /** When the eligibility read last returned, in milliseconds since the epoch. */
  lastCheckedAt: number | null;
  /** The block the last refetch was triggered by, when block watching is on. */
  blockNumber: bigint | undefined;
  isFetching: boolean;
  error: Error | null;
  /** Read both again now. */
  refresh: () => Promise<void>;
}

const SEVEN_DAYS = 7 * 24 * 60 * 60;

/**
 * Reads the two things a Redbelly UI has to know about a wallet before it offers a button: is
 * the wallet allowed to transact at all (the network's gate), and does it pass this action's
 * eligibility check (the dApp's verifier). Both are cached by wagmi's query client and shared by
 * every component that asks for the same wallet, verifier and request id; they refetch once per
 * new block, or every `refreshInterval` milliseconds if no block arrives (blocks on Redbelly are
 * produced on demand, so a quiet chain has no blocks to watch), and on `refresh()`.
 *
 * @param address The connected wallet, or undefined when nothing is connected.
 * @param verifier The dApp's verifier behind `IRedbellyVerifier`.
 * @param requestId The request id the gated contract is bound to (`Gated.requestId()`).
 */
export function useEligibility(
  address: Address | undefined,
  verifier: Address | undefined,
  requestId: bigint | number | undefined,
  options: UseEligibilityOptions = {},
): EligibilityResult {
  const currentChainId = useChainId();
  const chainId = options.chainId ?? currentChainId;
  const refreshInterval = options.refreshInterval ?? 30_000;
  const enabled = (options.enabled ?? true) && Boolean(address);
  const watchBlocks = options.watchBlocks ?? true;
  const requestIdBig = requestId === undefined ? undefined : BigInt(requestId);
  const permission = options.permission ?? (chainById(chainId)?.contracts['permission']?.address as Address | undefined);

  const block = useBlockNumber({
    chainId,
    watch: watchBlocks && enabled,
    query: { enabled: watchBlocks && enabled },
  });

  const allowed = useReadContract({
    address: permission,
    abi: permissionAbi,
    functionName: 'isAllowed',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: enabled && Boolean(permission),
      staleTime: refreshInterval,
      refetchInterval: refreshInterval,
      refetchOnWindowFocus: false,
    },
  });

  const eligible = useReadContract({
    address: verifier,
    abi: verifierAbi,
    functionName: 'isEligible',
    args: address && requestIdBig !== undefined ? [address, requestIdBig] : undefined,
    chainId,
    query: {
      enabled: enabled && Boolean(verifier) && requestIdBig !== undefined,
      staleTime: refreshInterval,
      refetchInterval: refreshInterval,
      refetchOnWindowFocus: false,
    },
  });

  const expiryFn = options.expiry;
  const expiry = useQuery({
    queryKey: ['redbelly-frontend-kit', 'expiry', chainId, address, verifier, requestIdBig?.toString()],
    queryFn: async () => {
      if (!expiryFn || !address || requestIdBig === undefined) return null;
      const value = await expiryFn({ address, requestId: requestIdBig });
      return value === null || value === undefined ? null : Number(value);
    },
    enabled: enabled && Boolean(expiryFn) && eligible.data === true,
    staleTime: refreshInterval,
    refetchInterval: refreshInterval,
    refetchOnWindowFocus: false,
  });

  // Refetch on a new block, and only on a new block: the block number itself is polled by wagmi.
  const lastBlock = useRef<bigint | undefined>(undefined);
  const refetchAllowed = allowed.refetch;
  const refetchEligible = eligible.refetch;
  const refetchExpiry = expiry.refetch;
  useEffect(() => {
    if (!watchBlocks || !enabled || block.data === undefined) return;
    if (lastBlock.current === undefined) {
      lastBlock.current = block.data;
      return;
    }
    if (block.data !== lastBlock.current) {
      lastBlock.current = block.data;
      void refetchAllowed();
      void refetchEligible();
      if (expiryFn) void refetchExpiry();
    }
  }, [block.data, watchBlocks, enabled, refetchAllowed, refetchEligible, refetchExpiry, expiryFn]);

  const refresh = useCallback(async () => {
    await Promise.all([refetchAllowed(), refetchEligible(), expiryFn ? refetchExpiry() : Promise.resolve()]);
  }, [refetchAllowed, refetchEligible, refetchExpiry, expiryFn]);

  // Something in this tab changed a wallet's eligibility (the dev state panel after `setStatus`
  // on a local Anvil, or the app after its own transaction): read again now, for this wallet.
  useEffect(() => {
    if (!enabled || !address) return;
    return onEligibilityChanged((changed) => {
      if (changed === undefined || changed.toLowerCase() === address.toLowerCase()) void refresh();
    });
  }, [enabled, address, refresh]);

  const expiresAt = expiry.data ?? null;
  const window = options.expiringWindowSeconds ?? SEVEN_DAYS;

  return useMemo(() => {
    const error = (allowed.error ?? eligible.error ?? expiry.error) as Error | null;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const secondsToExpiry = expiresAt === null || expiresAt === 0 ? null : expiresAt - nowSeconds;
    let state: EligibilityState;
    if (!address) state = 'disconnected';
    else if (error && allowed.data === undefined && eligible.data === undefined) state = 'error';
    else if (allowed.data === undefined && eligible.data === undefined) state = 'checking';
    else if (allowed.data === false) state = 'unverified';
    else if (eligible.data === false) state = 'ineligible';
    else if (eligible.data === true && secondsToExpiry !== null && secondsToExpiry <= window) state = 'expiring';
    else if (eligible.data === true) state = 'eligible';
    else state = 'checking';
    return {
      state,
      isAllowed: allowed.data,
      isEligible: eligible.data,
      expiresAt: expiresAt === 0 ? null : expiresAt,
      secondsToExpiry,
      lastCheckedAt: eligible.dataUpdatedAt || null,
      blockNumber: block.data,
      isFetching: allowed.isFetching || eligible.isFetching,
      error,
      refresh,
    };
  }, [address, allowed.data, allowed.error, allowed.isFetching, eligible.data, eligible.error, eligible.isFetching, eligible.dataUpdatedAt, expiry.error, expiresAt, window, block.data, refresh]);
}
