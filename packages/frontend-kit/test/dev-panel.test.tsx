// The dev state panel (PLAN.md 18.1) against a fake local Anvil: an in-memory chain 31337 that
// answers eth_call for the mock and the permission contract, takes anvil_impersonateAccount,
// eth_sendTransaction and anvil_stopImpersonatingAccount, and mines a receipt per transaction.
// Nothing leaves the process. The addresses are made up and hold nothing anywhere; none of them
// is an Anvil default account (the hygiene test enforces that for this file too).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, WagmiProvider } from 'wagmi';
import { custom, decodeFunctionData, encodeFunctionResult, type Chain, type Hex } from 'viem';
import { redbellyTestnet } from '@gatedpath/chains';
import type { ReactNode } from 'react';
import { permissionAbi, receptorMockStatusAbi, verifierAbi } from '../src/abi.js';
import { useEligibility } from '../src/useEligibility.js';
import { notifyEligibilityChanged } from '../src/events.js';
import { DevStatePanel, ELIGIBILITY_STATES, parseLocalDeployment, type LocalDeployment } from '../src/dev/index.js';
import { makeState, makeWrapper, VERIFIER, WALLET } from './mock-chain.js';

afterEach(cleanup);

const PERMISSION = redbellyTestnet.contracts.permission!.address as `0x${string}`;
const DEPLOYER = '0x7777777777777777777777777777777777777777' as const;
const wallets = ['0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333', '0x4444444444444444444444444444444444444444', '0x5555555555555555555555555555555555555555', '0x6666666666666666666666666666666666666666'] as const;

function deployment(overrides: Partial<LocalDeployment> = {}): LocalDeployment {
  return {
    chainId: 31337,
    forkOf: 153,
    verifier: VERIFIER,
    contract: '0x00000000000000000000000000000000000000c0',
    requestId: 18,
    deployer: { index: 7, address: DEPLOYER },
    wallets: wallets.map((address, i) => ({ index: i + 2, state: ELIGIBILITY_STATES[i]!, address, note: '' })),
    startedAt: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

interface LocalState {
  status: Record<string, number>;
  calls: { method: string; params?: unknown[]; fn?: string }[];
  impersonating: Set<string>;
  block: bigint;
}

/** A local chain 31337 whose RPC is the in-memory state above; `chainId` 153 makes the same transport a fake testnet. */
function makeLocalWrapper(state: LocalState, chainId = 31337) {
  const chain: Chain = {
    id: chainId,
    name: chainId === 31337 ? 'Local Anvil' : 'Fake testnet',
    nativeCurrency: { name: 'RBNT', symbol: 'RBNT', decimals: 18 },
    rpcUrls: { default: { http: ['http://127.0.0.1:1'] } },
    testnet: true,
  };
  const transport = custom(
    {
      async request({ method, params }: { method: string; params?: unknown[] }) {
        state.calls.push({ method, params });
        if (method === 'eth_chainId') return '0x' + chainId.toString(16);
        if (method === 'eth_blockNumber') return '0x' + state.block.toString(16);
        if (method === 'anvil_impersonateAccount') {
          state.impersonating.add(String(params![0]).toLowerCase());
          return null;
        }
        if (method === 'anvil_stopImpersonatingAccount') {
          state.impersonating.delete(String(params![0]).toLowerCase());
          return null;
        }
        if (method === 'eth_call') {
          const [{ to, data }] = params as [{ to: string; data: Hex }];
          if (to.toLowerCase() === PERMISSION.toLowerCase()) {
            state.calls[state.calls.length - 1]!.fn = 'isAllowed';
            return encodeFunctionResult({ abi: permissionAbi, functionName: 'isAllowed', result: true });
          }
          const decoded = decodeFunctionData({ abi: [...verifierAbi, ...receptorMockStatusAbi], data });
          state.calls[state.calls.length - 1]!.fn = decoded.functionName;
          const wallet = String(decoded.args[0]).toLowerCase();
          const status = state.status[wallet] ?? 0;
          if (decoded.functionName === 'isEligible') return encodeFunctionResult({ abi: verifierAbi, functionName: 'isEligible', result: status === 1 });
          return encodeFunctionResult({ abi: receptorMockStatusAbi, functionName: 'eligibilityStatus', result: status });
        }
        if (method === 'eth_sendTransaction') {
          const [{ from, to, data }] = params as [{ from: string; to: string; data: Hex }];
          if (!state.impersonating.has(from.toLowerCase())) throw new Error(`sender ${from} is not unlocked`);
          if (to.toLowerCase() !== VERIFIER.toLowerCase()) throw new Error(`unexpected target ${to}`);
          const decoded = decodeFunctionData({ abi: receptorMockStatusAbi, data });
          state.calls[state.calls.length - 1]!.fn = decoded.functionName;
          if (decoded.functionName !== 'setStatus') throw new Error('unexpected function');
          const [wallet, , status] = decoded.args;
          state.status[String(wallet).toLowerCase()] = Number(status);
          state.block += 1n;
          return '0x' + 'ab'.repeat(32);
        }
        if (method === 'eth_getTransactionReceipt') {
          const zero = '0x' + '00'.repeat(32);
          return {
            blockHash: zero,
            blockNumber: '0x' + state.block.toString(16),
            contractAddress: null,
            cumulativeGasUsed: '0x5208',
            effectiveGasPrice: '0x1',
            from: DEPLOYER,
            gasUsed: '0x5208',
            logs: [],
            logsBloom: '0x' + '00'.repeat(256),
            status: '0x1',
            to: VERIFIER,
            transactionHash: params![0],
            transactionIndex: '0x0',
            type: '0x2',
          };
        }
        throw new Error(`unexpected method ${method}`);
      },
    },
    { retryCount: 0 },
  );
  const config = createConfig({ chains: [chain], transports: { [chain.id]: transport }, pollingInterval: 40 });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
  return { Wrapper, config };
}

function localState(): LocalState {
  return { status: Object.fromEntries(wallets.map((w, i) => [w, i])), calls: [], impersonating: new Set(), block: 10n };
}

describe('parseLocalDeployment', () => {
  it('accepts the file npm run dev writes and refuses anything else', () => {
    const good = deployment();
    expect(parseLocalDeployment(JSON.stringify(good))).toEqual(good);
    expect(parseLocalDeployment('')).toBeNull();
    expect(parseLocalDeployment(undefined)).toBeNull();
    expect(parseLocalDeployment('not json')).toBeNull();
    expect(parseLocalDeployment(JSON.stringify({ ...good, chainId: 153 }))).toBeNull();
    expect(parseLocalDeployment(JSON.stringify({ ...good, chainId: 151 }))).toBeNull();
    // Enum order is part of the contract: wallets[0] is NeverIssued, wallets[1] Valid.
    const swapped = { ...good, wallets: [good.wallets[1]!, good.wallets[0]!, ...good.wallets.slice(2)] };
    expect(parseLocalDeployment(JSON.stringify(swapped))).toBeNull();
    // Accounts 0 and 1 are never used (RESEARCH.md 30).
    const zero = { ...good, wallets: good.wallets.map((w, i) => (i === 0 ? { ...w, index: 0 } : w)) };
    expect(parseLocalDeployment(JSON.stringify(zero))).toBeNull();
  });
});

describe('DevStatePanel', () => {
  it('renders nothing on chain 153, whatever deployment it is given', async () => {
    const { Wrapper } = makeWrapper(makeState());
    const { container } = render(<DevStatePanel deployment={deployment()} />, { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 80));
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on chain 151 either', async () => {
    const state = localState();
    const { Wrapper } = makeLocalWrapper(state, 151);
    const { container } = render(<DevStatePanel deployment={deployment()} />, { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 80));
    expect(container.innerHTML).toBe('');
    expect(state.calls.filter((c) => c.method === 'eth_sendTransaction')).toHaveLength(0);
  });

  it('renders nothing when the deployment file does not say chain 31337', async () => {
    const state = localState();
    const { Wrapper } = makeLocalWrapper(state);
    const { container } = render(<DevStatePanel deployment={{ ...deployment(), chainId: 153 }} />, { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 80));
    expect(container.innerHTML).toBe('');
  });

  it('on 31337 lists the five wallets in enum order with their live states, and none is connected yet', async () => {
    const state = localState();
    state.status[wallets[0]] = 3; // the chain has moved on since the file was written: Revoked now
    const { Wrapper } = makeLocalWrapper(state);
    render(<DevStatePanel deployment={deployment()} />, { wrapper: Wrapper });
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(6);
    await waitFor(() => expect(within(rows[1]!).getByText(/Revoked/)).toBeTruthy());
    expect(within(rows[2]!).getByText(/^Valid/)).toBeTruthy();
    expect(within(rows[5]!).getByText(/WrongJurisdiction/)).toBeTruthy();
    expect(screen.queryByText('connected')).toBeNull();
    expect(screen.getByText(/Connect a wallet above/)).toBeTruthy();
    for (const s of ELIGIBILITY_STATES) expect((screen.getByRole('button', { name: s }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('connects a seeded wallet without a key, marks it, and flips it through setStatus as the impersonated deployer', async () => {
    const state = localState();
    const { Wrapper } = makeLocalWrapper(state);
    render(<DevStatePanel deployment={deployment()} />, { wrapper: Wrapper });
    const rows = await screen.findAllByRole('row');
    fireEvent.click(within(rows[2]!).getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(within(rows[2]!).getByText('connected')).toBeTruthy());
    expect(screen.getByText(/Set wallet 3 to:/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Valid' }) as HTMLButtonElement).disabled).toBe(true); // already Valid
    expect((screen.getByRole('button', { name: 'Expired' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Expired' }));
    await waitFor(() => expect(screen.getByText(/is now Expired/)).toBeTruthy());
    expect(state.status[wallets[1]]).toBe(2);
    const sequence = state.calls.filter((c) => /^anvil_|^eth_sendTransaction$/.test(c.method)).map((c) => c.method);
    expect(sequence).toEqual(['anvil_impersonateAccount', 'eth_sendTransaction', 'anvil_stopImpersonatingAccount']);
    const impersonated = state.calls.filter((c) => c.method === 'anvil_impersonateAccount').map((c) => String(c.params![0]).toLowerCase());
    expect(impersonated).toEqual([DEPLOYER]);
    const sent = state.calls.find((c) => c.method === 'eth_sendTransaction')!.params![0] as { from: string };
    expect(sent.from.toLowerCase()).toBe(DEPLOYER);
    expect(state.impersonating.size).toBe(0);
    await waitFor(() => expect(within(rows[2]!).getByText(/Expired/)).toBeTruthy());
  });

  it('a mounted useEligibility for the flipped wallet re-reads without a new block', async () => {
    const state = localState();
    const { Wrapper } = makeLocalWrapper(state);
    function Page() {
      const e = useEligibility(wallets[1], VERIFIER, 18, { watchBlocks: false, refreshInterval: 60_000 });
      return (
        <>
          <p data-testid="state">{e.state}</p>
          <DevStatePanel deployment={deployment()} />
        </>
      );
    }
    render(<Page />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('eligible'));
    const rows = await screen.findAllByRole('row');
    fireEvent.click(within(rows[2]!).getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(within(rows[2]!).getByText('connected')).toBeTruthy());
    const before = state.calls.filter((c) => c.fn === 'isEligible').length;
    fireEvent.click(screen.getByRole('button', { name: 'Revoked' }));
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ineligible'));
    expect(state.calls.filter((c) => c.fn === 'isEligible').length).toBe(before + 1);
  });
});

describe('notifyEligibilityChanged', () => {
  it('makes useEligibility read again for that wallet and leaves other wallets alone', async () => {
    const state = makeState({ allowed: { [WALLET]: true }, eligible: { [WALLET]: false } });
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { watchBlocks: false, refreshInterval: 60_000 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('ineligible'));
    const reads = () => state.calls.filter((c) => c.fn === 'isEligible').length;
    const before = reads();
    state.eligible[WALLET] = true;
    notifyEligibilityChanged('0x9999999999999999999999999999999999999999');
    await new Promise((r) => setTimeout(r, 100));
    expect(reads()).toBe(before);
    expect(result.current.state).toBe('ineligible');
    notifyEligibilityChanged(WALLET);
    await waitFor(() => expect(result.current.state).toBe('eligible'));
    expect(reads()).toBe(before + 1);
    notifyEligibilityChanged();
    await waitFor(() => expect(reads()).toBe(before + 2));
  });
});
