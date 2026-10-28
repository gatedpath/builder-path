'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useBlockNumber, useChainId, useReadContracts } from 'wagmi';
import { registerTokenAbi, identityRegistryAbi, claimTopicsRegistryAbi, trustedIssuersRegistryAbi } from './abi.js';
import type { Address } from './useEligibility.js';

/**
 * Where a wallet stands with one ERC-3643 register, in words a page can switch on.
 * `not-a-register`: the address does not answer `identityRegistry()` with a contract.
 * `registered`: the register's identity registry has verified this wallet.
 * `not-registered`: it has not; only the issuer can change that.
 * `frozen`: verified, but the issuer has frozen this wallet's tokens.
 * `paused`: the issuer has paused every transfer of this register.
 */
export type RegisterState = 'disconnected' | 'checking' | 'not-a-register' | 'registered' | 'not-registered' | 'frozen' | 'paused' | 'error';

export interface UseRegisterOptions {
  chainId?: number;
  /** Refetch floor in milliseconds; the reads also refetch on every new block. Default 30 000. */
  refreshInterval?: number;
  watchBlocks?: boolean;
  enabled?: boolean;
}

export interface RegisterResult {
  state: RegisterState;
  /** The token's own facts, when it is a register. */
  token: { name: string | null; symbol: string | null; decimals: number | null; totalSupply: bigint | null; version: string | null; paused: boolean | null; identityRegistry: Address | null };
  /** The registry's shape: which issuers it trusts and which claim topics it requires. */
  registry: { trustedIssuers: Address[]; claimTopics: bigint[]; gate: 'registration only' | 'claims' | null };
  /** The wallet's standing, when a wallet was given. */
  wallet: { isVerified: boolean | null; registered: boolean | null; frozen: boolean | null; balance: bigint | null } | null;
  blockNumber: bigint | undefined;
  isFetching: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const ZERO = '0x0000000000000000000000000000000000000000';

/**
 * Reads an ERC-3643 register (a T-REX token) and, if a wallet is given, whether that register's
 * identity registry has verified it. The third of the three gates a holder meets on this network,
 * after `permission.isAllowed` and a dApp's recipe (`useEligibility`). Read-only; batched through
 * Multicall3 by wagmi; cached per chain and refetched on a new block. Only the issuer can register a
 * wallet, so a `not-registered` answer is information for the page, never a button.
 */
export function useRegister(token: Address | undefined, wallet: Address | undefined, options: UseRegisterOptions = {}): RegisterResult {
  const currentChainId = useChainId();
  const chainId = options.chainId ?? currentChainId;
  const refreshInterval = options.refreshInterval ?? 30_000;
  const watchBlocks = options.watchBlocks ?? true;
  const enabled = (options.enabled ?? true) && Boolean(token);

  const block = useBlockNumber({ chainId, watch: watchBlocks && enabled, query: { enabled: watchBlocks && enabled } });
  const query = { enabled, staleTime: refreshInterval, refetchInterval: refreshInterval, refetchOnWindowFocus: false } as const;

  // Pass one: the token. `identityRegistry()` decides whether there is a register at all.
  const tokenReads = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: (token ?? ZERO) as Address, abi: registerTokenAbi, functionName: 'identityRegistry', chainId },
      { address: (token ?? ZERO) as Address, abi: registerTokenAbi, functionName: 'name', chainId },
      { address: (token ?? ZERO) as Address, abi: registerTokenAbi, functionName: 'symbol', chainId },
      { address: (token ?? ZERO) as Address, abi: registerTokenAbi, functionName: 'decimals', chainId },
      { address: (token ?? ZERO) as Address, abi: registerTokenAbi, functionName: 'totalSupply', chainId },
      { address: (token ?? ZERO) as Address, abi: registerTokenAbi, functionName: 'version', chainId },
      { address: (token ?? ZERO) as Address, abi: registerTokenAbi, functionName: 'paused', chainId },
    ],
    query,
  });
  const t = tokenReads.data;
  const registryAddress = (t?.[0]?.status === 'success' ? (t[0].result as Address) : null) ?? null;
  const isRegister = registryAddress !== null && registryAddress !== ZERO;

  // Pass two: the registry's shape and the wallet's standing, once the registry is known.
  // The wallet reads are always in the batch, against the zero address when no wallet is given, so the
  // batch has one shape and the results can be read by position. Those answers are ignored without a wallet.
  const who = (wallet ?? ZERO) as Address;
  const registryFor = (registryAddress ?? ZERO) as Address;
  const tokenFor = (token ?? ZERO) as Address;
  const detailReads = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: registryFor, abi: identityRegistryAbi, functionName: 'issuersRegistry', chainId },
      { address: registryFor, abi: identityRegistryAbi, functionName: 'topicsRegistry', chainId },
      { address: registryFor, abi: identityRegistryAbi, functionName: 'isVerified', args: [who], chainId },
      { address: registryFor, abi: identityRegistryAbi, functionName: 'identity', args: [who], chainId },
      { address: tokenFor, abi: registerTokenAbi, functionName: 'isFrozen', args: [who], chainId },
      { address: tokenFor, abi: registerTokenAbi, functionName: 'balanceOf', args: [who], chainId },
    ],
    query: { ...query, enabled: enabled && isRegister },
  });
  const d = detailReads.data;
  const issuersRegistry = d?.[0]?.status === 'success' ? (d[0].result as Address) : null;
  const topicsRegistry = d?.[1]?.status === 'success' ? (d[1].result as Address) : null;

  // Pass three: the issuers and the topics.
  const shapeReads = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: (issuersRegistry ?? ZERO) as Address, abi: trustedIssuersRegistryAbi, functionName: 'getTrustedIssuers', chainId },
      { address: (topicsRegistry ?? ZERO) as Address, abi: claimTopicsRegistryAbi, functionName: 'getClaimTopics', chainId },
    ],
    query: { ...query, enabled: enabled && Boolean(issuersRegistry && topicsRegistry) },
  });
  const s = shapeReads.data;

  const refresh = async () => {
    await Promise.all([tokenReads.refetch(), detailReads.refetch(), shapeReads.refetch()]);
  };

  // Refetch on a new block, and only on a new block: wagmi polls the block number for us.
  const lastBlock = useRef<bigint | undefined>(undefined);
  const refetchToken = tokenReads.refetch;
  const refetchDetail = detailReads.refetch;
  const refetchShape = shapeReads.refetch;
  useEffect(() => {
    if (!watchBlocks || !enabled || block.data === undefined) return;
    if (lastBlock.current === undefined) {
      lastBlock.current = block.data;
      return;
    }
    if (block.data !== lastBlock.current) {
      lastBlock.current = block.data;
      void refetchToken();
      if (isRegister) void refetchDetail();
      if (issuersRegistry && topicsRegistry) void refetchShape();
    }
  }, [block.data, watchBlocks, enabled, isRegister, issuersRegistry, topicsRegistry, refetchToken, refetchDetail, refetchShape]);

  return useMemo<RegisterResult>(() => {
    const ok = <T,>(r: { status: string; result?: unknown } | undefined): T | null => (r && r.status === 'success' ? (r.result as T) : null);
    const error = (tokenReads.error ?? detailReads.error ?? shapeReads.error) as Error | null;
    const trustedIssuers = (ok<readonly Address[]>(s?.[0]) ?? []) as Address[];
    const claimTopics = (ok<readonly bigint[]>(s?.[1]) ?? []) as bigint[];
    const paused = ok<boolean>(t?.[6]);
    const isVerified = wallet ? ok<boolean>(d?.[2]) : null;
    const identity = wallet ? ok<Address>(d?.[3]) : null;
    const frozen = wallet ? ok<boolean>(d?.[4]) : null;
    const balance = wallet ? ok<bigint>(d?.[5]) : null;

    let state: RegisterState;
    if (!token) state = 'disconnected';
    else if (error) state = 'error';
    else if (tokenReads.isPending) state = 'checking';
    else if (!isRegister) state = 'not-a-register';
    else if (wallet && detailReads.isPending) state = 'checking';
    else if (paused) state = 'paused';
    else if (wallet && frozen) state = 'frozen';
    else if (wallet) state = isVerified ? 'registered' : 'not-registered';
    else state = 'registered';

    return {
      state,
      token: {
        name: ok<string>(t?.[1]),
        symbol: ok<string>(t?.[2]),
        decimals: ok<number>(t?.[3]),
        totalSupply: ok<bigint>(t?.[4]),
        version: ok<string>(t?.[5]),
        paused,
        identityRegistry: isRegister ? registryAddress : null,
      },
      registry: {
        trustedIssuers,
        claimTopics,
        gate: isRegister && s ? (claimTopics.length === 0 ? 'registration only' : 'claims') : null,
      },
      wallet: wallet && isRegister ? { isVerified, registered: identity !== null && identity !== ZERO, frozen, balance } : null,
      blockNumber: block.data,
      isFetching: tokenReads.isFetching || detailReads.isFetching || shapeReads.isFetching,
      error,
      refresh,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, wallet, t, d, s, isRegister, registryAddress, tokenReads.isPending, detailReads.isPending, tokenReads.isFetching, detailReads.isFetching, shapeReads.isFetching, tokenReads.error, detailReads.error, shapeReads.error, block.data]);
}
