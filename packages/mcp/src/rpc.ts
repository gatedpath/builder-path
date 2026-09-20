import { chainById, toCaller } from '@gatedpath/chains';

export type ChainId = 151 | 153;

export function networkName(chain: ChainId): 'mainnet' | 'testnet' {
  return chain === 151 ? 'mainnet' : 'testnet';
}

/** The governors RPC for a chain unless the caller names another (a local fork, say). */
export function rpcFor(chain: ChainId, override?: string): string {
  if (override) return override;
  const c = chainById(chain);
  if (!c) throw new Error(`unknown chain ${chain}`);
  return c.rpcUrls.default.http[0]!;
}

export async function reportedChainId(rpc: string): Promise<number> {
  return Number(BigInt((await toCaller(rpc)('eth_chainId')) as string));
}
