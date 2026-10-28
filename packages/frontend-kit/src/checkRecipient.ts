'use client';

// checkRecipient: the question card 13's RecipientGuard asks on chain, asked from the browser
// first, so a page can refuse before it asks for a signature. Same reads, same order, same
// answers as `RecipientGuard.check` and `_requirePasses`; the contract's answer is still the rule
// and this one is the courtesy. No cache here: `useRecipientCheck` caches per chain so an answer
// from 153 is never shown for 151.
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useChainId, usePublicClient } from 'wagmi';
import type { PublicClient } from 'viem';
import { addresses, chainById } from '@gatedpath/chains';
import { bootstrapRegistryAbi, permissionAbi } from './abi.js';
import type { Address } from './useEligibility.js';

/** `RecipientGuard.Verdict`, plus the one case where the guard cannot reach a verdict at all. */
export type RecipientVerdict = 'permissioned' | 'not-permissioned' | 'contract' | 'zero' | 'no-permission-contract';

/** One per named revert in `RecipientGuard`, except `NativeTransferFailed`, which only the send itself can find. */
export type RecipientReasonKind = 'zero-recipient' | 'recipient-is-contract' | 'recipient-not-permissioned' | 'no-permission-contract' | 'nothing-to-send';

export interface RecipientReason {
  kind: RecipientReasonKind;
  /** The guard's error name for this refusal, as a block explorer or `explainError` would show it. */
  error: 'ZeroRecipient' | 'RecipientIsContract' | 'RecipientNotPermissioned' | 'NoPermissionContract' | 'NothingToSend';
  /** A sentence for the page. */
  plainWords: string;
}

export interface CheckRecipientOptions {
  recipient: Address;
  /** The chain the client reads. Refused when the client says it is on a different one. */
  chainId: number;
  /** True when the user has said a contract is what they mean to pay (`send(to, allowContract)`). Default false. */
  allowContract?: boolean;
  /** The amount about to be sent, when known; zero is refused the way `send` refuses an empty call. */
  amount?: bigint;
  /** Skip the registry and read this permission contract. Default: resolve it live, as the guard does. */
  permission?: Address;
  /** The bootstrap registry. Default: the shared address from @gatedpath/chains. */
  registry?: Address;
}

export interface RecipientCheck {
  /** True when the guard would let the send through to this recipient. */
  ok: boolean;
  verdict: RecipientVerdict;
  /** Empty when `ok`. Otherwise every refusal the guard would raise, in the order it raises them. */
  reasons: RecipientReason[];
  recipient: Address;
  chainId: number;
  /** The permission contract the answer came from, when one was read. */
  permission: Address | null;
}

const ZERO: Address = '0x0000000000000000000000000000000000000000';

const WORDS: Record<RecipientReasonKind, Omit<RecipientReason, 'kind'>> = {
  'zero-recipient': {
    error: 'ZeroRecipient',
    plainWords: 'That is the zero address. Nothing can be sent there, and the guard refuses it.',
  },
  'recipient-is-contract': {
    error: 'RecipientIsContract',
    plainWords: 'This is a contract, not a wallet, so it has never been through the identity gate. The guard refuses it unless you say a contract is what you mean to pay.',
  },
  'recipient-not-permissioned': {
    error: 'RecipientNotPermissioned',
    plainWords: 'No one verified holds this address on this chain. Money sent there would be gone, so the guard refuses.',
  },
  'no-permission-contract': {
    error: 'NoPermissionContract',
    plainWords: 'This chain has no permission contract behind its registry, so there is nothing to check a recipient against. The guard refuses every send here.',
  },
  'nothing-to-send': {
    error: 'NothingToSend',
    plainWords: 'The amount is zero. There is nothing to send.',
  },
};

function reason(kind: RecipientReasonKind): RecipientReason {
  return { kind, ...WORDS[kind] };
}

/** `RecipientGuard._isContract`: code at the address, unless it is an EIP-7702 delegation designator, which is still a wallet. */
function isContractCode(code: `0x${string}` | undefined): boolean {
  if (!code || code === '0x') return false;
  const bytes = (code.length - 2) / 2;
  return !(bytes === 23 && code.toLowerCase().startsWith('0xef0100'));
}

/**
 * Asks the network what `RecipientGuard.check(to)` would answer, and turns it into the refusals
 * `send` would raise. Reads, in the guard's order: the recipient's code; then, for a wallet, the
 * registry's code, the permission contract it names, that contract's code, and `isAllowed`. The
 * permission contract is resolved on every call and never remembered, because its proxy admin has
 * moved before (14 September 2026); pass `permission` to skip that when the page already knows it.
 *
 * What `ok` means: an address someone verified holds on this chain, or a contract the user has
 * said they mean. It does not mean the right person: a typo that lands on another verified
 * address goes through. Say that on the page.
 */
export async function checkRecipient(client: PublicClient, options: CheckRecipientOptions): Promise<RecipientCheck> {
  const { recipient, chainId } = options;
  if (client.chain && client.chain.id !== chainId) {
    throw new Error(`checkRecipient: the client is on chain ${client.chain.id}, not ${chainId}; an answer from one chain is never shown for another`);
  }
  const reasons: RecipientReason[] = [];
  if (options.amount !== undefined && options.amount === 0n) reasons.push(reason('nothing-to-send'));

  const base = { recipient, chainId, permission: null as Address | null };
  if (recipient.toLowerCase() === ZERO) {
    reasons.push(reason('zero-recipient'));
    return { ...base, ok: false, verdict: 'zero', reasons };
  }

  const code = await client.getCode({ address: recipient });
  if (isContractCode(code)) {
    if (!options.allowContract) reasons.push(reason('recipient-is-contract'));
    return { ...base, ok: reasons.length === 0, verdict: 'contract', reasons };
  }

  let permission = options.permission ?? null;
  if (!permission) {
    const registry = options.registry ?? (chainById(chainId)?.contracts['bootstrapRegistry']?.address as Address | undefined) ?? (addresses.mainnet.bootstrapRegistry.address as Address);
    const registryCode = await client.getCode({ address: registry });
    const named = registryCode && registryCode !== '0x'
      ? await client.readContract({ address: registry, abi: bootstrapRegistryAbi, functionName: 'getContractAddress', args: ['permission'] })
      : ZERO;
    const permissionCode = named.toLowerCase() === ZERO ? '0x' : await client.getCode({ address: named });
    if (!permissionCode || permissionCode === '0x') {
      reasons.push(reason('no-permission-contract'));
      return { ...base, ok: false, verdict: 'no-permission-contract', reasons };
    }
    permission = named;
  }

  const allowed = await client.readContract({ address: permission, abi: permissionAbi, functionName: 'isAllowed', args: [recipient] });
  if (!allowed) reasons.push(reason('recipient-not-permissioned'));
  return { ...base, permission, ok: reasons.length === 0, verdict: allowed ? 'permissioned' : 'not-permissioned', reasons };
}

export interface UseRecipientCheckOptions {
  /** Chain to read on. Defaults to wagmi's current chain. */
  chainId?: number;
  allowContract?: boolean;
  permission?: Address;
  registry?: Address;
  /** How long an answer is kept before the next render reads again. Default 30 000 ms. */
  refreshInterval?: number;
  enabled?: boolean;
}

export interface RecipientCheckResult {
  /** The last answer, or null before the first one. */
  check: RecipientCheck | null;
  isChecking: boolean;
  error: Error | null;
  /** Read again now. */
  refresh: () => Promise<void>;
}

/**
 * `checkRecipient` as a hook: runs when `recipient` is set, caches the answer under the chain id
 * and the recipient for `refreshInterval`, and reads again on `refresh()`. Mount it on the
 * recipient field; show `check.reasons[*].plainWords` under it.
 */
export function useRecipientCheck(recipient: Address | undefined, options: UseRecipientCheckOptions = {}): RecipientCheckResult {
  const currentChainId = useChainId();
  const chainId = options.chainId ?? currentChainId;
  const client = usePublicClient({ chainId });
  const allowContract = options.allowContract ?? false;
  const enabled = (options.enabled ?? true) && Boolean(client && recipient);
  const { permission, registry } = options;

  const query = useQuery({
    queryKey: ['redbelly-frontend-kit', 'recipient', chainId, recipient?.toLowerCase(), allowContract, permission, registry],
    queryFn: () => checkRecipient(client as PublicClient, { recipient: recipient as Address, chainId, allowContract, permission, registry }),
    enabled,
    staleTime: options.refreshInterval ?? 30_000,
    refetchOnWindowFocus: false,
  });

  const refetch = query.refetch;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return useMemo(
    () => ({ check: query.data ?? null, isChecking: enabled && query.isPending, error: (query.error as Error | null) ?? null, refresh }),
    [query.data, query.isPending, query.error, enabled, refresh],
  );
}
