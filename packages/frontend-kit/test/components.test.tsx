import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import {
  Checking,
  Eligible,
  EligibilityError,
  EligibilityGate,
  ExpiringSoon,
  GasWarning,
  Ineligible,
  LastChecked,
  NotConnected,
  NotVerified,
} from '../src/components.js';
import { ACCESS_URL, FAUCET_URL, VINE_INTERACTION_URL } from '../src/urls.js';
import type { EligibilityResult } from '../src/useEligibility.js';
import { WALLET } from './mock-chain.js';

afterEach(cleanup);

function result(partial: Partial<EligibilityResult>): EligibilityResult {
  return {
    state: 'checking',
    isAllowed: undefined,
    isEligible: undefined,
    expiresAt: null,
    secondsToExpiry: null,
    lastCheckedAt: null,
    blockNumber: undefined,
    isFetching: false,
    error: null,
    refresh: async () => {},
    ...partial,
  };
}

describe('state components', () => {
  it('NotConnected asks for a wallet', () => {
    render(<NotConnected />);
    expect(screen.getByRole('status').className).toContain('rb-elig-disconnected');
    expect(screen.getByText(/Connect a wallet/)).toBeTruthy();
  });

  it('NotVerified links to the Access dApp and, on testnet, the faucet, and warns against switching wallets', () => {
    const { rerender } = render(<NotVerified address={WALLET} chainName="Redbelly Network Testnet" testnet />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain(ACCESS_URL);
    expect(links).toContain(FAUCET_URL);
    expect(screen.getByText(/0x1111…1111/)).toBeTruthy();
    expect(screen.getByText(/Don't switch to another wallet/)).toBeTruthy();
    rerender(<NotVerified address={WALLET} />);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).not.toContain(FAUCET_URL);
  });

  it('Ineligible names the requirement and says the answer is a plain yes or no', () => {
    render(<Ineligible requirement="an Australian proof of address" />);
    expect(screen.getByText(/an Australian proof of address/)).toBeTruthy();
    expect(screen.getByText(/plain yes or no/)).toBeTruthy();
  });

  it('Eligible and ExpiringSoon wrap the action', () => {
    render(
      <Eligible>
        <button>Subscribe</button>
      </Eligible>,
    );
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeTruthy();
    cleanup();
    const expiresAt = Math.floor(Date.now() / 1000) + 3 * 86_400;
    render(
      <ExpiringSoon expiresAt={expiresAt} secondsToExpiry={3 * 86_400}>
        <button>Subscribe</button>
      </ExpiringSoon>,
    );
    expect(screen.getByText(/expires in 3 days/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeTruthy();
    expect(document.querySelector('time')?.getAttribute('dateTime')).toBe(new Date(expiresAt * 1000).toISOString());
  });

  it('Checking is busy and EligibilityError retries', () => {
    render(<Checking />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    cleanup();
    let retried = 0;
    render(<EligibilityError error={new Error('rpc down')} onRetry={() => retried++} />);
    expect(screen.getByRole('alert').textContent).toContain('rpc down');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retried).toBe(1);
  });

  it('LastChecked shows the time and block and calls refresh', () => {
    let refreshed = 0;
    const r = result({ lastCheckedAt: Date.UTC(2026, 8, 12, 12, 0, 0), blockNumber: 3179592n, refresh: async () => void refreshed++ });
    render(<LastChecked eligibility={r} />);
    expect(screen.getByText(/at block 3179592/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refreshed).toBe(1);
  });

  it('GasWarning carries the live figure and links to Vine', () => {
    render(<GasWarning transferUsd="0.0100" />);
    expect(screen.getByText(/US\$0\.0100/)).toBeTruthy();
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toContain(VINE_INTERACTION_URL);
  });
});

describe('EligibilityGate', () => {
  const cases: Array<[EligibilityResult['state'], string]> = [
    ['disconnected', 'rb-elig-disconnected'],
    ['checking', 'rb-elig-checking'],
    ['unverified', 'rb-elig-unverified'],
    ['ineligible', 'rb-elig-ineligible'],
    ['eligible', 'rb-elig-eligible'],
    ['expiring', 'rb-elig-expiring'],
    ['error', 'rb-elig-error'],
  ];
  for (const [state, cls] of cases) {
    it(`renders ${state}`, () => {
      const r = result({ state, expiresAt: 1_800_000_000, secondsToExpiry: 3600, error: new Error('x') });
      render(
        <EligibilityGate eligibility={r} address={state === 'disconnected' ? undefined : WALLET}>
          <button>Act</button>
        </EligibilityGate>,
      );
      expect(document.querySelector('.rb-elig')?.className).toContain(cls);
      const hasAction = state === 'eligible' || state === 'expiring';
      expect(Boolean(screen.queryByRole('button', { name: 'Act' }))).toBe(hasAction);
    });
  }

  it('lets the caller replace any state', () => {
    const r = result({ state: 'ineligible' });
    render(<EligibilityGate eligibility={r} address={WALLET} render={{ ineligible: (x) => <p>custom {x.state}</p> }} />);
    expect(screen.getByText('custom ineligible')).toBeTruthy();
    expect(document.querySelector('.rb-elig')).toBeNull();
  });
});
