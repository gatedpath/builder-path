// A wagmi config over a fake Redbelly testnet. The transport answers eth_chainId,
// eth_blockNumber and eth_call from an in-memory state the tests mutate; nothing leaves the
// process. The wallet addresses below are made up for the tests and hold nothing anywhere.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, WagmiProvider } from 'wagmi';
import { custom, decodeFunctionData, encodeFunctionResult, multicall3Abi, type Chain, type Hex } from 'viem';
import { redbellyTestnet } from '@gatedpath/chains';
import type { ReactNode } from 'react';
import { permissionAbi, bootstrapRegistryAbi, receptorMockAbi, verifierAbi, registerTokenAbi, identityRegistryAbi, trustedIssuersRegistryAbi, claimTopicsRegistryAbi } from '../src/abi.js';

export const VERIFIER = '0x00000000000000000000000000000000000000e1' as const;
export const WALLET = '0x1111111111111111111111111111111111111111' as const;
export const OTHER = '0x2222222222222222222222222222222222222222' as const;
export const PERMISSION = redbellyTestnet.contracts.permission!.address as `0x${string}`;
export const BOOTSTRAP = redbellyTestnet.contracts.bootstrapRegistry!.address as `0x${string}`;
export const MULTICALL3 = redbellyTestnet.contracts.multicall3!.address as `0x${string}`;
/** Some bytecode, for an address the tests want `eth_getCode` to call a contract. */
export const SOME_CODE = '0x6080604052' as const;
// An ERC-3643 register and its three registries, made up for the tests.
export const REGISTER = '0x00000000000000000000000000000000000000a1' as const;
export const REGISTRY = '0x00000000000000000000000000000000000000a2' as const;
export const ISSUERS = '0x00000000000000000000000000000000000000a3' as const;
export const TOPICS = '0x00000000000000000000000000000000000000a4' as const;
export const PLAIN_TOKEN = '0x00000000000000000000000000000000000000a9' as const;
export const ISSUER_ONE = '0x00000000000000000000000000000000000000b1' as const;

export interface MockState {
  block: bigint;
  allowed: Record<string, boolean>;
  eligible: Record<string, boolean>;
  expiresAt: Record<string, number>;
  calls: { method: string; fn?: string }[];
  fail?: Error;
  /** The register's state: who is verified and frozen, balances, required topics, issuers, pause. */
  register: { verified: Record<string, boolean>; frozen: Record<string, boolean>; balance: Record<string, bigint>; topics: bigint[]; issuers: `0x${string}`[]; paused: boolean };
  /** What `eth_getCode` answers per address; anything not listed is a plain wallet (`0x`). */
  code: Record<string, Hex>;
  /** What the bootstrap registry names as "permission". */
  permissionNamed: `0x${string}`;
}

export function makeState(overrides: Partial<MockState> = {}): MockState {
  // The registry and the permission contract have code unless a test takes it away.
  const code = { [BOOTSTRAP]: SOME_CODE, [PERMISSION]: SOME_CODE, ...(overrides.code ?? {}) };
  return { block: 100n, allowed: {}, eligible: {}, expiresAt: {}, calls: [], register: { verified: {}, frozen: {}, balance: {}, topics: [1n, 2n], issuers: [ISSUER_ONE], paused: false }, permissionNamed: PERMISSION, ...overrides, code };
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
  if (lower(to) === lower(BOOTSTRAP)) {
    const { args } = decodeFunctionData({ abi: bootstrapRegistryAbi, data });
    state.calls.push({ method: 'eth_call', fn: 'getContractAddress' });
    // Testnet answers the zero address for a name it does not know (chain-definitions, registryNames).
    const named = args[0] === 'permission' ? state.permissionNamed : '0x0000000000000000000000000000000000000000';
    return encodeFunctionResult({ abi: bootstrapRegistryAbi, functionName: 'getContractAddress', result: named });
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
  if (lower(to) === lower(REGISTER)) {
    const decoded = decodeFunctionData({ abi: registerTokenAbi, data });
    state.calls.push({ method: 'eth_call', fn: decoded.functionName });
    const r = state.register;
    const wallet = (decoded.args?.[0] as string | undefined) ?? '';
    switch (decoded.functionName) {
      case 'identityRegistry': return encodeFunctionResult({ abi: registerTokenAbi, functionName: 'identityRegistry', result: REGISTRY });
      case 'name': return encodeFunctionResult({ abi: registerTokenAbi, functionName: 'name', result: 'CLASS A' });
      case 'symbol': return encodeFunctionResult({ abi: registerTokenAbi, functionName: 'symbol', result: 'A' });
      case 'decimals': return encodeFunctionResult({ abi: registerTokenAbi, functionName: 'decimals', result: 18 });
      case 'totalSupply': return encodeFunctionResult({ abi: registerTokenAbi, functionName: 'totalSupply', result: 1000n });
      case 'version': return encodeFunctionResult({ abi: registerTokenAbi, functionName: 'version', result: '4.1.3' });
      case 'paused': return encodeFunctionResult({ abi: registerTokenAbi, functionName: 'paused', result: r.paused });
      case 'isFrozen': return encodeFunctionResult({ abi: registerTokenAbi, functionName: 'isFrozen', result: r.frozen[lower(wallet)] ?? false });
      case 'balanceOf': return encodeFunctionResult({ abi: registerTokenAbi, functionName: 'balanceOf', result: r.balance[lower(wallet)] ?? 0n });
      default: throw new Error(`unexpected register call ${decoded.functionName}`);
    }
  }
  if (lower(to) === lower(REGISTRY)) {
    const decoded = decodeFunctionData({ abi: identityRegistryAbi, data });
    state.calls.push({ method: 'eth_call', fn: decoded.functionName });
    const r = state.register;
    const wallet = (decoded.args?.[0] as string | undefined) ?? '';
    switch (decoded.functionName) {
      case 'issuersRegistry': return encodeFunctionResult({ abi: identityRegistryAbi, functionName: 'issuersRegistry', result: ISSUERS });
      case 'topicsRegistry': return encodeFunctionResult({ abi: identityRegistryAbi, functionName: 'topicsRegistry', result: TOPICS });
      case 'isVerified': return encodeFunctionResult({ abi: identityRegistryAbi, functionName: 'isVerified', result: r.verified[lower(wallet)] ?? false });
      case 'identity': return encodeFunctionResult({ abi: identityRegistryAbi, functionName: 'identity', result: r.verified[lower(wallet)] ? ISSUER_ONE : '0x0000000000000000000000000000000000000000' });
      default: throw new Error(`unexpected registry call ${decoded.functionName}`);
    }
  }
  if (lower(to) === lower(ISSUERS)) {
    state.calls.push({ method: 'eth_call', fn: 'getTrustedIssuers' });
    return encodeFunctionResult({ abi: trustedIssuersRegistryAbi, functionName: 'getTrustedIssuers', result: state.register.issuers });
  }
  if (lower(to) === lower(TOPICS)) {
    state.calls.push({ method: 'eth_call', fn: 'getClaimTopics' });
    return encodeFunctionResult({ abi: claimTopicsRegistryAbi, functionName: 'getClaimTopics', result: state.register.topics });
  }
  if (lower(to) === lower(PLAIN_TOKEN)) {
    // A plain ERC-20: identityRegistry() reverts, the way a contract without the function does.
    throw new Error('execution reverted');
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
        if (method === 'eth_getCode') {
          const [address] = params as [string];
          state.calls.push({ method, fn: 'getCode' });
          return Object.entries(state.code).find(([a]) => lower(a) === lower(address))?.[1] ?? '0x';
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
