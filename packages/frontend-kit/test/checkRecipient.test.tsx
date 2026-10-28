import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { createPublicClient, type Chain } from 'viem';
import { redbellyTestnet } from '@gatedpath/chains';
import { checkRecipient, useRecipientCheck } from '../src/checkRecipient.js';
import { BOOTSTRAP, countCalls, makeState, makeTransport, makeWrapper, OTHER, PERMISSION, SOME_CODE, WALLET, type MockState } from './mock-chain.js';

afterEach(cleanup);

const CHAIN = redbellyTestnet as unknown as Chain;
const ZERO = '0x0000000000000000000000000000000000000000' as const;
// A contract address made up for these tests, and a 23-byte EIP-7702 designator pointing at it.
const CONTRACT = '0x00000000000000000000000000000000000000c1' as const;
const DELEGATED_CODE = `0xef0100${CONTRACT.slice(2)}` as const;

function clientFor(state: MockState) {
  return createPublicClient({ chain: CHAIN, transport: makeTransport(state) });
}

describe('checkRecipient', () => {
  it('passes a wallet that permission.isAllowed says yes to, naming the permission contract it read', async () => {
    const state = makeState({ allowed: { [OTHER]: true } });
    const result = await checkRecipient(clientFor(state), { recipient: OTHER, chainId: 153 });
    expect(result).toMatchObject({ ok: true, verdict: 'permissioned', reasons: [], recipient: OTHER, chainId: 153, permission: PERMISSION });
    // The guard's order: the recipient's code, the registry's code, the name, the named contract's code, then isAllowed.
    expect(countCalls(state, 'getCode')).toBe(3);
    expect(countCalls(state, 'getContractAddress')).toBe(1);
    expect(countCalls(state, 'isAllowed')).toBe(1);
  });

  it('refuses the zero address without reading anything (ZeroRecipient)', async () => {
    const state = makeState();
    const result = await checkRecipient(clientFor(state), { recipient: ZERO, chainId: 153 });
    expect(result.ok).toBe(false);
    expect(result.verdict).toBe('zero');
    expect(result.reasons.map((r) => r.kind)).toEqual(['zero-recipient']);
    expect(result.reasons[0]?.error).toBe('ZeroRecipient');
    expect(result.reasons[0]?.plainWords).toMatch(/zero address/);
    expect(state.calls.length).toBe(0);
  });

  it('refuses a contract unless the caller allows one, and never asks isAllowed about it (RecipientIsContract)', async () => {
    const state = makeState({ code: { [CONTRACT]: SOME_CODE }, allowed: { [CONTRACT]: true } });
    const refused = await checkRecipient(clientFor(state), { recipient: CONTRACT, chainId: 153 });
    expect(refused.ok).toBe(false);
    expect(refused.verdict).toBe('contract');
    expect(refused.reasons.map((r) => r.error)).toEqual(['RecipientIsContract']);
    expect(refused.reasons[0]?.plainWords).toMatch(/contract, not a wallet/);

    const allowed = await checkRecipient(clientFor(state), { recipient: CONTRACT, chainId: 153, allowContract: true });
    expect(allowed).toMatchObject({ ok: true, verdict: 'contract', reasons: [], permission: null });
    expect(countCalls(state, 'isAllowed')).toBe(0);
    expect(countCalls(state, 'getContractAddress')).toBe(0);
  });

  it('treats an EIP-7702 delegated wallet as a wallet, not a contract', async () => {
    const state = makeState({ code: { [WALLET]: DELEGATED_CODE }, allowed: { [WALLET]: true } });
    const result = await checkRecipient(clientFor(state), { recipient: WALLET, chainId: 153 });
    expect(result).toMatchObject({ ok: true, verdict: 'permissioned' });
    expect(countCalls(state, 'isAllowed')).toBe(1);
  });

  it('refuses a wallet no one verified holds on this chain (RecipientNotPermissioned)', async () => {
    const state = makeState({ allowed: { [OTHER]: false } });
    const result = await checkRecipient(clientFor(state), { recipient: OTHER, chainId: 153 });
    expect(result.ok).toBe(false);
    expect(result.verdict).toBe('not-permissioned');
    expect(result.reasons.map((r) => r.error)).toEqual(['RecipientNotPermissioned']);
    expect(result.reasons[0]?.plainWords).toMatch(/No one verified holds this address/);
    expect(result.permission).toBe(PERMISSION);
  });

  it('refuses every send when the registry names nothing, or names an address with no code (NoPermissionContract)', async () => {
    const namesNothing = makeState({ permissionNamed: ZERO, allowed: { [OTHER]: true } });
    const a = await checkRecipient(clientFor(namesNothing), { recipient: OTHER, chainId: 153 });
    expect(a).toMatchObject({ ok: false, verdict: 'no-permission-contract', permission: null });
    expect(a.reasons.map((r) => r.error)).toEqual(['NoPermissionContract']);
    expect(countCalls(namesNothing, 'isAllowed')).toBe(0);

    const namesEmpty = makeState({ permissionNamed: CONTRACT, allowed: { [OTHER]: true } });
    const b = await checkRecipient(clientFor(namesEmpty), { recipient: OTHER, chainId: 153 });
    expect(b.verdict).toBe('no-permission-contract');

    // A chain with no registry at all: the same answer, and the registry is never called.
    const noRegistry = makeState({ code: { [BOOTSTRAP]: '0x' }, allowed: { [OTHER]: true } });
    const c = await checkRecipient(clientFor(noRegistry), { recipient: OTHER, chainId: 153 });
    expect(c.verdict).toBe('no-permission-contract');
    expect(c.reasons[0]?.plainWords).toMatch(/no permission contract/);
    expect(countCalls(noRegistry, 'getContractAddress')).toBe(0);
  });

  it('refuses a zero amount the way send refuses an empty call (NothingToSend), beside the recipient reason', async () => {
    const state = makeState({ allowed: { [OTHER]: true, [WALLET]: false } });
    const fine = await checkRecipient(clientFor(state), { recipient: OTHER, chainId: 153, amount: 0n });
    expect(fine.ok).toBe(false);
    expect(fine.verdict).toBe('permissioned');
    expect(fine.reasons.map((r) => r.error)).toEqual(['NothingToSend']);

    const both = await checkRecipient(clientFor(state), { recipient: WALLET, chainId: 153, amount: 0n });
    expect(both.reasons.map((r) => r.error)).toEqual(['NothingToSend', 'RecipientNotPermissioned']);

    const some = await checkRecipient(clientFor(state), { recipient: OTHER, chainId: 153, amount: 1n });
    expect(some.ok).toBe(true);
  });

  it('reads a given permission contract directly, skipping the registry', async () => {
    const state = makeState({ allowed: { [OTHER]: true } });
    const result = await checkRecipient(clientFor(state), { recipient: OTHER, chainId: 153, permission: PERMISSION });
    expect(result.ok).toBe(true);
    expect(countCalls(state, 'getContractAddress')).toBe(0);
    expect(countCalls(state, 'getCode')).toBe(1);
  });

  it('refuses to answer for a chain the client is not on', async () => {
    const state = makeState({ allowed: { [OTHER]: true } });
    await expect(checkRecipient(clientFor(state), { recipient: OTHER, chainId: 151 })).rejects.toThrow(/chain 153, not 151/);
    expect(state.calls.length).toBe(0);
  });

  it('lets an RPC failure through as an error, never as a verdict', async () => {
    const state = makeState({ fail: new Error('governors RPC unreachable') });
    await expect(checkRecipient(clientFor(state), { recipient: OTHER, chainId: 153 })).rejects.toThrow(/unreachable/);
  });
});

describe('useRecipientCheck', () => {
  it('does nothing without a recipient, then checks one and caches the answer', async () => {
    const state = makeState({ allowed: { [OTHER]: true } });
    const { Wrapper } = makeWrapper(state);
    let recipient: `0x${string}` | undefined;
    const { result, rerender } = renderHook(() => useRecipientCheck(recipient), { wrapper: Wrapper });
    expect(result.current.check).toBeNull();
    expect(result.current.isChecking).toBe(false);
    expect(state.calls.length).toBe(0);

    recipient = OTHER;
    rerender();
    await waitFor(() => expect(result.current.check?.ok).toBe(true));
    expect(result.current.check?.chainId).toBe(153);
    const reads = state.calls.length;
    rerender();
    expect(state.calls.length).toBe(reads);
  });

  it('shows the refusal in words and moves when refreshed', async () => {
    const state = makeState({ allowed: { [OTHER]: false } });
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useRecipientCheck(OTHER), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.check?.verdict).toBe('not-permissioned'));
    expect(result.current.check?.reasons[0]?.plainWords).toMatch(/would be gone/);

    state.allowed[OTHER] = true;
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.check?.ok).toBe(true));
    expect(countCalls(state, 'isAllowed')).toBe(2);
  });

  it('answers under the chain id, so allowContract or a new recipient is a new read', async () => {
    const state = makeState({ code: { [CONTRACT]: SOME_CODE } });
    const { Wrapper } = makeWrapper(state);
    let allowContract = false;
    const { result, rerender } = renderHook(() => useRecipientCheck(CONTRACT, { allowContract }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.check?.ok).toBe(false));
    allowContract = true;
    rerender();
    await waitFor(() => expect(result.current.check?.ok).toBe(true));
    expect(result.current.check?.verdict).toBe('contract');
  });

  it('reports an RPC failure as an error', async () => {
    const state = makeState({ fail: new Error('governors RPC unreachable') });
    const { Wrapper } = makeWrapper(state);
    const { result } = renderHook(() => useRecipientCheck(OTHER), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error?.message).toMatch(/unreachable/));
    expect(result.current.check).toBeNull();
  });
});
