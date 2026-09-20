// The read-only tools: chain facts, isAllowed, gas in USD, docs lookup. Public addresses and
// numbers in, facts out. `rpc` is an override for a local fork; the default is the governors
// endpoint for the chain.
import { addresses, chainById, gasCostUsd, isAllowed, knownAllowed } from '@gatedpath/chains';
import { z } from 'zod';
import { fail, ok } from '../guard.js';
import { listTopics, lookupDocs } from '../docs-map.js';
import { rpcFor, networkName } from '../rpc.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const chainSchema = z.union([z.literal(151), z.literal(153)]).describe('151 for mainnet, 153 for testnet');
export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'a 20-byte hex address').describe('A public address, 0x plus 40 hex characters');
export const rpcSchema = z.string().url().optional().describe('JSON-RPC URL override, for a local fork; default is the governors endpoint for the chain');

export const chainInfoInput = z.object({ chain: chainSchema }).strict();
export function chainInfo(args: z.infer<typeof chainInfoInput>): CallToolResult {
  const chain = chainById(args.chain);
  if (!chain) return fail(`unknown chain ${args.chain}`);
  const net = networkName(args.chain);
  return ok({
    chain,
    addresses: addresses[net],
    knownAllowed: knownAllowed[net],
    note: 'Every address carries the date it was verified on this chain and its source. Import these from @gatedpath/chains rather than copying them.',
  });
}

export const isVerifiedInput = z.object({ address: addressSchema, chain: chainSchema, rpc: rpcSchema }).strict();
export async function isVerified(args: z.infer<typeof isVerifiedInput>): Promise<CallToolResult> {
  const rpc = rpcFor(args.chain, args.rpc);
  try {
    const allowed = await isAllowed(args.address, { rpc });
    return ok({
      address: args.address,
      chain: args.chain,
      allowed,
      meaning: allowed ? 'This wallet may send transactions on this chain.' : 'This wallet has not completed identity verification on this chain. Send the person to https://access.redbelly.network; do not retry and do not switch wallets without telling them.',
      source: `permission.isAllowed(address) on the contract the bootstrap registry names "permission", read from ${rpc}`,
    });
  } catch (e) {
    return fail(`could not read isAllowed: ${(e as Error).message}`, { rpc });
  }
}

export const gasEstimateInput = z.object({
  gas: z.number().int().positive().max(60_000_000_000).describe('Gas units, for example what forge script or eth_estimateGas reported'),
  chain: chainSchema,
  rpc: rpcSchema,
}).strict();
export async function gasEstimateUsd(args: z.infer<typeof gasEstimateInput>): Promise<CallToolResult> {
  const rpc = rpcFor(args.chain, args.rpc);
  try {
    const c = await gasCostUsd({ gasUsed: args.gas, rpc });
    return ok({
      gas: args.gas,
      chain: args.chain,
      rbnt: c.rbnt,
      usd: c.usd,
      usdPerRbnt: c.usdPerRbnt,
      gasPriceWei: c.gasPriceWei.toString(),
      priceTimestamp: new Date(c.priceTimestamp * 1000).toISOString(),
      note: 'Gas is priced in US dollars and converted to RBNT at execution from the on-chain feed, so the USD figure is the stable one. Never hardcode the wei price.',
    });
  } catch (e) {
    return fail(`could not price gas: ${(e as Error).message}`, { rpc });
  }
}

export const docsLookupInput = z.object({ topic: z.string().min(1).max(80).describe(`One of: ${listTopics().join(', ')} (aliases accepted)`) }).strict();
export function docsLookup(args: z.infer<typeof docsLookupInput>): CallToolResult {
  const hit = lookupDocs(args.topic);
  if (!hit) return fail(`no entry for "${args.topic}"`, { topics: listTopics() });
  return ok({ ...hit });
}
