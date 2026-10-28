import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useRegister } from '../src/useRegister.js';
import { countCalls, makeState, makeWrapper, PLAIN_TOKEN, REGISTER, WALLET, OTHER, ISSUER_ONE } from './mock-chain.js';

afterEach(cleanup);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useRegister', () => {
  it('is disconnected without a token and reads nothing', async () => {
    const state = makeState();
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useRegister(undefined, WALLET), { wrapper: Wrapper });
    expect(result.current.state).toBe('disconnected');
    await sleep(100);
    expect(countCalls(state, 'identityRegistry')).toBe(0);
  });

  it('says not-a-register for a plain ERC-20', async () => {
    const state = makeState();
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useRegister(PLAIN_TOKEN, WALLET), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('not-a-register'));
    expect(result.current.token.identityRegistry).toBeNull();
    expect(result.current.wallet).toBeNull();
  });

  it('reads the register and says a verified wallet is registered, with the claims gate', async () => {
    const state = makeState();
    state.register.verified[WALLET.toLowerCase()] = true;
    state.register.balance[WALLET.toLowerCase()] = 25n;
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useRegister(REGISTER, WALLET), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('registered'));
    expect(result.current.token.name).toBe('CLASS A');
    expect(result.current.token.version).toBe('4.1.3');
    expect(result.current.token.totalSupply).toBe(1000n);
    expect(result.current.wallet?.isVerified).toBe(true);
    expect(result.current.wallet?.registered).toBe(true);
    expect(result.current.wallet?.balance).toBe(25n);
    await waitFor(() => expect(result.current.registry.gate).toBe('claims'));
    expect(result.current.registry.trustedIssuers.map((a) => a.toLowerCase())).toEqual([ISSUER_ONE.toLowerCase()]);
    expect(result.current.registry.claimTopics).toEqual([1n, 2n]);
  });

  it('says not-registered for a wallet the issuer has not registered', async () => {
    const state = makeState();
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useRegister(REGISTER, OTHER), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('not-registered'));
    expect(result.current.wallet?.registered).toBe(false);
    expect(result.current.wallet?.balance).toBe(0n);
  });

  it('a register with no required topics is gated by registration only', async () => {
    const state = makeState();
    state.register.topics = [];
    state.register.issuers = [];
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useRegister(REGISTER, undefined), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.registry.gate).toBe('registration only'));
    expect(result.current.state).toBe('registered');
    expect(result.current.wallet).toBeNull();
  });

  it('frozen and paused win over registered', async () => {
    const frozenState = makeState();
    frozenState.register.verified[WALLET.toLowerCase()] = true;
    frozenState.register.frozen[WALLET.toLowerCase()] = true;
    const a = renderHook(() => useRegister(REGISTER, WALLET), { wrapper: makeWrapper(frozenState).Wrapper });
    await waitFor(() => expect(a.result.current.state).toBe('frozen'));

    const pausedState = makeState();
    pausedState.register.verified[WALLET.toLowerCase()] = true;
    pausedState.register.paused = true;
    const b = renderHook(() => useRegister(REGISTER, WALLET), { wrapper: makeWrapper(pausedState).Wrapper });
    await waitFor(() => expect(b.result.current.state).toBe('paused'));
    expect(b.result.current.token.paused).toBe(true);
  });

  it('reads once, then again only on a new block', async () => {
    const state = makeState();
    state.register.verified[WALLET.toLowerCase()] = true;
    const { Wrapper } = makeWrapper(state, 30);
    const { result } = renderHook(() => useRegister(REGISTER, WALLET, { refreshInterval: 60_000 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.state).toBe('registered'));
    await sleep(250);
    const before = countCalls(state, 'isVerified');
    expect(before).toBe(1);
    state.register.verified[WALLET.toLowerCase()] = false;
    state.block = 101n;
    await waitFor(() => expect(result.current.state).toBe('not-registered'), { timeout: 3000 });
    expect(countCalls(state, 'isVerified')).toBeGreaterThanOrEqual(2);
  });
});
