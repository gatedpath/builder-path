// A wagmi config over a fake Redbelly testnet. The transport answers eth_chainId,
// eth_blockNumber and eth_call from an in-memory state the tests mutate; nothing leaves the
// process. The wallet addresses below are made up for the tests and hold nothing anywhere.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, WagmiProvider } from 'wagmi';
import { custom, decodeFunctionData, encodeFunctionResult, multicall3Abi, type Chain, type Hex } from 'viem';
import { redbellyTestnet } from '@gatedpath/chains';
import type { ReactNode } from 'react';
import { permissionAbi, receptorMockAbi, verifierAbi } from '../src/abi.js';

export const VERIFIER = '0x00000000000000000000000000000000000000e1' as const;
export const WALLET = '0x1111111111111111111111111111111111111111' as const;
export const OTHER = '0x2222222222222222222222222222222222222222' as const;
export const PERMISSION = redbellyTestnet.contracts.permission!.address as `0x${string}`;
export const MULTICALL3 = redbellyTestnet.contracts.multicall3!.address as `0x${string}`;

export interface MockState {
  block: bigint;
  allowed: Record<string, boolean>;
  eligible: Record<string, boolean>;
  expiresAt: Record<string, number>;
  calls: { method: string; fn?: string }[];
  fail?: Error;
}

export function makeState(overrides: Partial<MockState> = {}): MockState {
  return { block: 100n, allowed: {}, eligible: {}, expiresAt: {}, calls: [], ...overrides };
}

function lower(a: string): string {
  return a.toLowerCase();
}

function answerCall(state: MockState, to: string, data: Hex): Hex {
  if (lower(to) === lower(PERMISSION)) {
    const { args } = decodeFunctionData({ abi: permissionAbi, data });
    state.calls.push({ method: 'eth_call', fn: 'isAllowed' });
    return encodeFunctionResult({ abi: permissionAbi, functionName: 'isAllowed', result: state.allowed[lower(args[0])] ?? false });
  }
  if (lower(to) === lower(VERIFIER)) {
    const decoded = decodeFunctionData({ abi: [...verifierAbi, ...receptorMockAbi], data });
    state.calls.push({ method: 'eth_call', fn: decoded.functionName });
    if (decoded.functionName === 'isEligible') {
      const [wallet] = decoded.args;
      return encodeFunctionResult({ abi: verifierAbi, functionName: 'isEligible', result: state.eligible[lower(wallet)] ?? false });
    }
    const [wallet] = decoded.args;
    const expiresAt = BigInt(state.expiresAt[lower(wallet)] ?? 0);
    return encodeFunctionResult({
      abi: receptorMockAbi,
      functionName: 'recordFor',
      result: { isSet: (state.eligible[lower(wallet)] ?? false) || expiresAt > 0n, status: 1, expiresAt },
    });
  }
  throw new Error(`unexpected eth_call to ${to}`);
}

export function makeTransport(state: MockState) {
  return custom(
    {
      async request({ method, params }: { method: string; params?: unknown[] }) {
        if (state.fail) throw state.fail;
        if (method === 'eth_chainId') return '0x99';
        if (method === 'eth_blockNumber') {
          state.calls.push({ method });
          return '0x' + state.block.toString(16);
        }
        if (method === 'eth_call') {
          const [{ to, data }] = params as [{ to: string; data: Hex }];
          // wagmi batches reads through Multicall3 (deployed on 151 and 153, chain-definitions);
          // answer aggregate3 the way the real contract would so the tests run the production path.
          if (lower(to) === lower(MULTICALL3)) {
            const { args } = decodeFunctionData({ abi: multicall3Abi, data });
            const calls = args[0] as { target: string; allowFailure: boolean; callData: Hex }[];
            const results = calls.map((c) => {
              try {
                return { success: true, returnData: answerCall(state, c.target, c.callData) };
              } catch (e) {
                if (!c.allowFailure) throw e;
                return { success: false, returnData: '0x' as Hex };
              }
            });
            return encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: results });
          }
          return answerCall(state, to, data);
        }
        throw new Error(`unexpected method ${method}`);
      },
    },
    // No retries: a thrown error is the test's signal, not something to wait out.
    { retryCount: 0 },
  );
}

export function makeWrapper(state: MockState, pollingInterval = 40) {
  const chain = redbellyTestnet as unknown as Chain;
  const config = createConfig({
    chains: [chain],
    transports: { [chain.id]: makeTransport(state) },
    pollingInterval,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
  return { Wrapper, config, queryClient };
}

export function countCalls(state: MockState, fn: string): number {
  return state.calls.filter((c) => c.fn === fn).length;
}
