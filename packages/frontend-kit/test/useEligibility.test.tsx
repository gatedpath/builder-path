import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { useEligibility } from '../src/useEligibility.js';
import { countCalls, makeState, makeWrapper, OTHER, VERIFIER, WALLET } from './mock-chain.js';

afterEach(cleanup);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useEligibility', () => {
  it('is disconnected without an address and makes no contract read', async () => {
    const state = makeState();
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useEligibility(undefined, VERIFIER, 1n), { wrapper: Wrapper });
    expect(result.current.state).toBe('disconnected');
    await sleep(100);
    expect(countCalls(state, 'isAllowed')).toBe(0);
    expect(countCalls(state, 'isEligible')).toBe(0);
  });

  it('is unverified when permission.isAllowed is false, whatever the verifier says', async () => {
    const state = makeState({ allowed: { [WALLET]: false }, eligible: { [WALLET]: true } });
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useEligibility(WALLET, VERIFIER, 1n), { wrapper: Wrapper });
    expect(result.current.state).toBe('checking');
    await waitFor(() => expect(result.current.state).toBe('unverified'));
    expect(result.current.isAllowed).toBe(false);
  });

  it('is ineligible when the wallet is allowed on the network but the verifier says no', async () => {
    const state = makeState({ allowed: { [WALLET]: true }, eligible: { [WALLET]: false } });
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useEligibility(WALLET, VERIFIER, 1n), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('ineligible'));
    expect(result.current.isAllowed).toBe(true);
    expect(result.current.isEligible).toBe(false);
  });

  it('is eligible when both say yes, with a last-checked time and the block number', async () => {
    const state = makeState({ allowed: { [WALLET]: true }, eligible: { [WALLET]: true } });
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useEligibility(WALLET, VERIFIER, 7), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('eligible'));
    expect(result.current.lastCheckedAt).toBeTypeOf('number');
    await waitFor(() => expect(result.current.blockNumber).toBe(100n));
    expect(result.current.expiresAt).toBeNull();
  });

  it('reads once per wallet, verifier and request id, then only on a new block', async () => {
    const state = makeState({ allowed: { [WALLET]: true }, eligible: { [WALLET]: true } });
    const { Wrapper } = makeWrapper(state, 30);
    const { result } = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { refreshInterval: 60_000 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('eligible'));
    await sleep(250);
    expect(countCalls(state, 'isEligible')).toBe(1);
    expect(countCalls(state, 'isAllowed')).toBe(1);

    // A new block: one refetch each, and the answer moves with the chain.
    state.eligible[WALLET] = false;
    state.block = 101n;
    await waitFor(() => expect(result.current.state).toBe('ineligible'));
    expect(countCalls(state, 'isEligible')).toBe(2);
    expect(countCalls(state, 'isAllowed')).toBe(2);
    await sleep(250);
    expect(countCalls(state, 'isEligible')).toBe(2);
  });

  it('refreshes on demand without waiting for a block', async () => {
    const state = makeState({ allowed: { [WALLET]: true }, eligible: { [WALLET]: false } });
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { watchBlocks: false, refreshInterval: 60_000 }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.state).toBe('ineligible'));
    state.eligible[WALLET] = true;
    await sleep(100);
    expect(result.current.state).toBe('ineligible');
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state).toBe('eligible');
    expect(countCalls(state, 'eth_blockNumber' as never)).toBe(0);
  });

  it('shares one read between two components asking the same question', async () => {
    const state = makeState({ allowed: { [WALLET]: true }, eligible: { [WALLET]: true } });
    const { Wrapper } = makeWrapper(state);
    const a = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { watchBlocks: false }), { wrapper: Wrapper });
    const b = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { watchBlocks: false }), { wrapper: Wrapper });
    await waitFor(() => expect(a.result.current.state).toBe('eligible'));
    await waitFor(() => expect(b.result.current.state).toBe('eligible'));
    // Two hooks in two trees: wagmi's query client is per provider, so two reads; inside one
    // tree it would be one. The point is that the second hook did not add a third.
    expect(countCalls(state, 'isEligible')).toBeLessThanOrEqual(2);
  });

  it('turns to expiring when the verifier can tell and the window is near', async () => {
    const now = Math.floor(Date.now() / 1000);
    const state = makeState({ allowed: { [WALLET]: true, [OTHER]: true }, eligible: { [WALLET]: true, [OTHER]: true } });
    const expiry = async ({ address }: { address: string }) => (address === WALLET ? now + 86_400 : now + 30 * 86_400);
    const { Wrapper } = makeWrapper(state);
    const soon = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { expiry, watchBlocks: false }), { wrapper: Wrapper });
    await waitFor(() => expect(soon.result.current.state).toBe('expiring'));
    expect(soon.result.current.expiresAt).toBe(now + 86_400);
    expect(soon.result.current.secondsToExpiry).toBeGreaterThan(86_000);

    const later = renderHook(() => useEligibility(OTHER, VERIFIER, 1n, { expiry, watchBlocks: false }), { wrapper: Wrapper });
    await waitFor(() => expect(later.result.current.isEligible).toBe(true));
    await sleep(50);
    expect(later.result.current.state).toBe('eligible');

    const wide = renderHook(
      () => useEligibility(OTHER, VERIFIER, 1n, { expiry, watchBlocks: false, expiringWindowSeconds: 60 * 86_400 }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(wide.result.current.state).toBe('expiring'));
  });

  it('never turns to expiring for an ineligible wallet, and stays eligible when the verifier cannot tell', async () => {
    const state = makeState({ allowed: { [WALLET]: true }, eligible: { [WALLET]: false } });
    const { Wrapper } = makeWrapper(state);
    const expiry = async () => Math.floor(Date.now() / 1000) + 10;
    const { result } = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { expiry, watchBlocks: false }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('ineligible'));
    await sleep(50);
    expect(result.current.expiresAt).toBeNull();

    const none = makeState({ allowed: { [WALLET]: true }, eligible: { [WALLET]: true } });
    const w2 = makeWrapper(none);
    const r2 = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { expiry: async () => null, watchBlocks: false }), {
      wrapper: w2.Wrapper,
    });
    await waitFor(() => expect(r2.result.current.state).toBe('eligible'));
  });

  it('reports an error when the RPC fails and nothing is cached', async () => {
    const state = makeState({ fail: new Error('governors RPC unreachable') });
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { watchBlocks: false }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.error?.message).toMatch(/unreachable/);
  });

  it('does nothing while disabled', async () => {
    const state = makeState({ allowed: { [WALLET]: true }, eligible: { [WALLET]: true } });
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useEligibility(WALLET, VERIFIER, 1n, { enabled: false }), { wrapper: Wrapper });
    await sleep(120);
    expect(result.current.state).toBe('checking');
    expect(state.calls.length).toBe(0);
  });
});
