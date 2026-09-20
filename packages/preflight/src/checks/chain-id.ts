import type { CheckResult } from '../types.js';

export function checkChainId(expected: number | null, reported: number | null, expectedSource: string, rpc: string): CheckResult {
  if (reported === null) return { id: 'chain-id', status: 'fail', reason: `The RPC at ${rpc} did not answer eth_chainId.` };
  if (reported !== 151 && reported !== 153) return { id: 'chain-id', status: 'fail', reason: `The RPC reports chain ${reported}, which is neither Redbelly mainnet (151) nor testnet (153).`, data: { expected, reported } };
  if (expected === null) return { id: 'chain-id', status: 'skip', reason: `No chain ID in the project config; pass --chain to compare it with the RPC's ${reported}.`, data: { expected, reported } };
  if (expected !== reported) return { id: 'chain-id', status: 'fail', reason: `${expectedSource} says chain ${expected} but the RPC at ${rpc} reports ${reported}.`, data: { expected, reported } };
  return { id: 'chain-id', status: 'pass', reason: `${expectedSource} says chain ${expected} and the RPC reports ${reported}.`, data: { expected, reported } };
}
