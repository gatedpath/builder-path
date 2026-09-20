// explainError over real viem errors: the classes constructed the way viem constructs them, and,
// end to end, a wallet client over a transport that answers the way a node and a wallet do
// (a NotEligible revert with data, EIP-1193 code 4001, insufficient funds). No network.
import { describe, expect, it } from 'vitest';
import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  createWalletClient,
  custom,
  encodeErrorResult,
  parseAbi,
  toFunctionSelector,
} from 'viem';
import { redbellyTestnet } from '@gatedpath/chains';
import { NOT_ELIGIBLE_SELECTOR, ZERO_VERIFIER_SELECTOR, failures } from '@gatedpath/agent-rules/failures';
import { explainError } from '../src/explainError.js';
import { VERIFIER, WALLET } from './mock-chain.js';

const gatedAbi = parseAbi(['error NotEligible(address wallet, uint64 requestId)', 'error ZeroVerifier()', 'function subscribe()']);
const notEligibleData = encodeErrorResult({ abi: gatedAbi, errorName: 'NotEligible', args: [WALLET, 18n] });

describe('explainError', () => {
  it('the selectors in the shared table are the keccak of their signatures', () => {
    expect(toFunctionSelector('NotEligible(address,uint64)')).toBe(NOT_ELIGIBLE_SELECTOR);
    expect(toFunctionSelector('ZeroVerifier()')).toBe(ZERO_VERIFIER_SELECTOR);
    expect(failures.length).toBeGreaterThan(30);
  });

  it('decodes a ContractFunctionRevertedError carrying NotEligible, with and without the ABI', () => {
    const withAbi = new ContractFunctionRevertedError({ abi: gatedAbi, data: notEligibleData, functionName: 'subscribe' });
    const e = explainError(withAbi);
    expect(e.kind).toBe('not-eligible');
    expect(e.plainWords).toMatch(/^The contract refused this wallet/);
    expect(e.notEligible).toEqual({ wallet: WALLET.toLowerCase(), requestId: '18' });
    expect(e.selector).toBe(NOT_ELIGIBLE_SELECTOR);
    expect(e.fix.link).toMatch(/docs\.redbelly\.network/);
    expect(e.docsPage).toBe('/concepts/identity-gate/');
    const withoutAbi = new ContractFunctionRevertedError({ abi: [], data: notEligibleData, functionName: 'subscribe' });
    const f = explainError(withoutAbi);
    expect(f.kind).toBe('not-eligible');
    expect(f.notEligible).toEqual({ wallet: WALLET.toLowerCase(), requestId: '18' });
  });

  it('names the credential state when the page knows it', () => {
    const err = new ContractFunctionRevertedError({ abi: gatedAbi, data: notEligibleData, functionName: 'subscribe' });
    expect(explainError(err, { eligibilityStatus: 'Expired' }).kind).toBe('not-eligible-expired');
    expect(explainError(err, { eligibilityStatus: 3 }).kind).toBe('not-eligible-revoked');
    expect(explainError(err, { eligibilityStatus: 0 }).kind).toBe('not-eligible-never-issued');
    expect(explainError(err, { eligibilityStatus: 4 }).plainWords).toMatch(/doesn't satisfy this request's query/);
    expect(explainError(err, { eligibilityStatus: 1 }).kind).toBe('not-eligible');
    expect(explainError(err, { eligibilityStatus: null }).kind).toBe('not-eligible');
  });

  it('decodes ZeroVerifier and the deploy script reasons', () => {
    const zero = new ContractFunctionRevertedError({ abi: gatedAbi, data: encodeErrorResult({ abi: gatedAbi, errorName: 'ZeroVerifier' }), functionName: 'subscribe' });
    expect(explainError(zero).kind).toBe('zero-verifier');
    const reason = new ContractFunctionRevertedError({ abi: gatedAbi, message: 'ADMIN_SAFE threshold must be at least 2', functionName: 'subscribe' });
    expect(explainError(reason).kind).toBe('deploy-threshold-below-2');
  });

  it('user rejection, wrong chain and insufficient funds by class, wherever they sit in the cause chain', () => {
    const rejected = new UserRejectedRequestError(new Error('User rejected the request.'));
    expect(explainError(rejected).kind).toBe('user-rejected');
    expect(explainError(rejected).fix.link).toMatch(/vine\.redbelly\.network/);
    const wrapped = new BaseError('write failed', { cause: rejected });
    expect(explainError(wrapped).kind).toBe('user-rejected');
    const mismatch = new ChainMismatchError({ chain: redbellyTestnet as never, currentChainId: 1 });
    const m = explainError(mismatch);
    expect(m.kind).toBe('wallet-wrong-chain');
    expect(m.fix.command).toMatch(/cast chain-id/);
    const funds = new InsufficientFundsError({ cause: new Error('insufficient funds') });
    const f = explainError(funds);
    expect(f.kind).toBe('insufficient-funds');
    expect(f.fix.link).toBe('https://redbelly.faucetme.pro/');
    expect(explainError({ code: 4001, message: 'User rejected the request' }).kind).toBe('user-rejected');
  });

  it('end to end: a wallet client over a transport that reverts NotEligible, refuses in the wallet, and is short of RBNT', async () => {
    const answers: Record<string, () => unknown> = {};
    const transport = custom(
      {
        async request({ method }: { method: string }) {
          if (method === 'eth_chainId') return '0x99';
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [WALLET];
          const a = answers[method];
          if (a) return a();
          throw new Error(`unexpected ${method}`);
        },
      },
      { retryCount: 0 },
    );
    const client = createWalletClient({ account: WALLET, chain: redbellyTestnet as never, transport });
    const revert = () => {
      const e = new Error('execution reverted') as Error & { code: number; data: string };
      e.code = 3;
      e.data = notEligibleData;
      throw e;
    };
    answers['eth_estimateGas'] = revert;
    answers['eth_sendTransaction'] = revert;
    answers['eth_call'] = revert;
    let caught: unknown;
    try {
      await client.writeContract({ address: VERIFIER, abi: gatedAbi, functionName: 'subscribe', chain: redbellyTestnet as never });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const e = explainError(caught);
    expect(e.kind).toBe('not-eligible');
    expect(e.notEligible?.requestId).toBe('18');

    answers['eth_estimateGas'] = () => '0x5208';
    answers['eth_sendTransaction'] = () => {
      const err = new Error('User rejected the request.') as Error & { code: number };
      err.code = 4001;
      throw err;
    };
    try {
      await client.writeContract({ address: VERIFIER, abi: gatedAbi, functionName: 'subscribe', chain: redbellyTestnet as never });
    } catch (err) {
      caught = err;
    }
    expect(explainError(caught).kind).toBe('user-rejected');

    answers['eth_sendTransaction'] = () => {
      const err = new Error('Insufficient funds for gas * price + value') as Error & { code: number };
      err.code = -32003;
      throw err;
    };
    try {
      await client.writeContract({ address: VERIFIER, abi: gatedAbi, functionName: 'subscribe', chain: redbellyTestnet as never });
    } catch (err) {
      caught = err;
    }
    expect(explainError(caught).kind).toBe('insufficient-funds');
  });

  it('unknown errors come back as unknown with their own words, never a guess', () => {
    const e = explainError(new Error('something odd'));
    expect(e.kind).toBe('unknown');
    expect(e.raw).toBe('something odd');
    expect(e.fix).toEqual({});
    expect(explainError('plain text').kind).toBe('unknown');
    expect(explainError(null).kind).toBe('unknown');
    const unknownSelector = new ContractFunctionRevertedError({ abi: [], data: '0xdeadbeef00000000000000000000000000000000000000000000000000000000000000000', functionName: 'x' });
    const u = explainError(unknownSelector);
    expect(u.kind).toBe('unknown');
    expect(u.selector).toBe('0xdeadbeef');
  });

  it('every explanation keeps the house style: no exclamation mark, no em dash', () => {
    for (const f of failures) {
      expect(f.plainWords).not.toMatch(/[!—]/);
      expect(f.cause).not.toMatch(/[!—]/);
    }
  });
});
