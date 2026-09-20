'use client';

import type { ReactNode } from 'react';
import { ACCESS_URL, FAUCET_URL, VINE_FEES_URL, VINE_INTERACTION_URL } from './urls.js';
import type { Address, EligibilityResult, EligibilityState } from './useEligibility.js';

/*
 * Headless with a small default style. Every component renders plain elements with `rb-elig`
 * class names that `styles.css` styles from the site's design tokens; pass `className` to add
 * your own, or don't load the stylesheet and style the class names yourself. No component makes
 * a network call; they render what `useEligibility` returned.
 */

export interface StateProps {
  className?: string;
  children?: ReactNode;
}

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ');
}

function short(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** State 1: nothing is connected. */
export function NotConnected({ className, children }: StateProps) {
  return (
    <div className={cx('rb-elig', 'rb-elig-disconnected', className)} role="status">
      <p className="rb-elig-title">Connect a wallet</p>
      <p className="rb-elig-body">
        {children ?? 'Redbelly checks identity per wallet, so the app needs a wallet before it can tell you anything.'}
      </p>
    </div>
  );
}

export interface NotVerifiedProps extends StateProps {
  address: Address;
  /** Human name of the chain, for the sentence. */
  chainName?: string;
  /** True on chain 153: shows the faucet link. */
  testnet?: boolean;
}

/** State 2: connected, but `permission.isAllowed` is false. The wallet cannot transact at all. */
export function NotVerified({ address, chainName = 'this network', testnet = false, className, children }: NotVerifiedProps) {
  return (
    <div className={cx('rb-elig', 'rb-elig-unverified', className)} role="status">
      <p className="rb-elig-title">Verify your wallet</p>
      <p className="rb-elig-body">
        <code>{short(address)}</code> is not yet allowed to transact on {chainName}. Redbelly gates every wallet behind a
        one-time identity check; this app never sees your documents, only a true or false from the network.
      </p>
      <ol className="rb-elig-steps">
        <li>
          Open{' '}
          <a href={ACCESS_URL} target="_blank" rel="noreferrer">
            {ACCESS_URL}
          </a>{' '}
          with this same wallet and complete verification.
        </li>
        {testnet && (
          <li>
            Get testnet RBNT from{' '}
            <a href={FAUCET_URL} target="_blank" rel="noreferrer">
              FAUCETME
            </a>{' '}
            so you can pay gas.
          </li>
        )}
        <li>Come back here. This page re-checks on every new block and moves on by itself.</li>
      </ol>
      <p className="rb-elig-muted">
        {children ?? "Don't switch to another wallet to get past this: the credential belongs to the wallet that was verified."}
      </p>
    </div>
  );
}

export interface IneligibleProps extends StateProps {
  /** What the action needs, in plain words: "an Australian proof of address", "an over-18 credential". */
  requirement?: string;
}

/** State 3: verified on the network, but the verifier says no for this action. */
export function Ineligible({ requirement, className, children }: IneligibleProps) {
  return (
    <div className={cx('rb-elig', 'rb-elig-ineligible', className)} role="status">
      <p className="rb-elig-title">Not eligible for this action</p>
      <p className="rb-elig-body">
        {children ??
          `Your wallet is verified on the network, but it does not hold an accepted proof for this action${requirement ? ` (${requirement})` : ''}. The contract would refuse the transaction, so the button stays off.`}
      </p>
      <p className="rb-elig-muted">
        The check is on-chain and the answer is a plain yes or no; the app cannot tell whether a credential is missing,
        expired or revoked. Your identity wallet can.
      </p>
    </div>
  );
}

/** State 4: eligible. Usually wraps the action button. */
export function Eligible({ className, children }: StateProps) {
  return (
    <div className={cx('rb-elig', 'rb-elig-eligible', className)} role="status">
      <p className="rb-elig-title">Eligible</p>
      {children}
    </div>
  );
}

export interface ExpiringSoonProps extends StateProps {
  expiresAt: number;
  secondsToExpiry: number;
}

function humanDuration(seconds: number): string {
  if (seconds <= 0) return 'now';
  const days = Math.floor(seconds / 86_400);
  if (days >= 2) return `${days} days`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 2) return `${hours} hours`;
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} minutes`;
}

/** State 5: eligible, and the verifier says the credential expires soon. Wraps the action too. */
export function ExpiringSoon({ expiresAt, secondsToExpiry, className, children }: ExpiringSoonProps) {
  const when = new Date(expiresAt * 1000);
  return (
    <div className={cx('rb-elig', 'rb-elig-expiring', className)} role="status">
      <p className="rb-elig-title">Eligible, credential expires in {humanDuration(secondsToExpiry)}</p>
      <p className="rb-elig-body">
        After <time dateTime={when.toISOString()}>{when.toUTCString()}</time> this wallet will be refused until the credential is
        renewed. Renew it in your identity wallet before then; a transaction sent after expiry reverts.
      </p>
      {children}
    </div>
  );
}

/** Shown while both reads are in flight for the first time. */
export function Checking({ className, children }: StateProps) {
  return (
    <div className={cx('rb-elig', 'rb-elig-checking', className)} role="status" aria-busy="true">
      <p className="rb-elig-body">{children ?? 'Checking the network and the verifier…'}</p>
    </div>
  );
}

export interface EligibilityErrorProps extends StateProps {
  error: Error | null;
  onRetry?: () => void;
}

/** An RPC or contract read failed and nothing is cached. Says so; does not guess. */
export function EligibilityError({ error, onRetry, className, children }: EligibilityErrorProps) {
  return (
    <div className={cx('rb-elig', 'rb-elig-error', className)} role="alert">
      <p className="rb-elig-title">Could not check eligibility</p>
      <p className="rb-elig-body">{children ?? (error?.message ?? 'The RPC did not answer.')}</p>
      {onRetry && (
        <button type="button" className="rb-elig-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export interface EligibilityGateProps {
  /** The result of `useEligibility`. */
  eligibility: EligibilityResult;
  address: Address | undefined;
  chainName?: string;
  testnet?: boolean;
  requirement?: string;
  className?: string;
  /** Rendered inside the eligible and expiring states: the action itself. */
  children?: ReactNode;
  /** Override any state with your own markup. A function receives the hook result. */
  render?: Partial<Record<EligibilityState, ReactNode | ((r: EligibilityResult) => ReactNode)>>;
}

/** One component that picks the state component for you. Bring your own action as `children`. */
export function EligibilityGate({ eligibility, address, chainName, testnet, requirement, className, children, render }: EligibilityGateProps) {
  const custom = render?.[eligibility.state];
  if (custom !== undefined) return <>{typeof custom === 'function' ? custom(eligibility) : custom}</>;
  switch (eligibility.state) {
    case 'disconnected':
      return <NotConnected className={className} />;
    case 'checking':
      return <Checking className={className} />;
    case 'unverified':
      return <NotVerified address={address as Address} chainName={chainName} testnet={testnet} className={className} />;
    case 'ineligible':
      return <Ineligible requirement={requirement} className={className} />;
    case 'expiring':
      return (
        <ExpiringSoon expiresAt={eligibility.expiresAt as number} secondsToExpiry={eligibility.secondsToExpiry as number} className={className}>
          {children}
        </ExpiringSoon>
      );
    case 'eligible':
      return <Eligible className={className}>{children}</Eligible>;
    case 'error':
      return <EligibilityError error={eligibility.error} onRetry={() => void eligibility.refresh()} className={className} />;
  }
}

export interface LastCheckedProps {
  eligibility: EligibilityResult;
  className?: string;
}

/** "Last checked" line with a refresh button. Put it under any gate. */
export function LastChecked({ eligibility, className }: LastCheckedProps) {
  const at = eligibility.lastCheckedAt;
  return (
    <p className={cx('rb-elig-last-checked', className)}>
      {at ? (
        <>
          Last checked <time dateTime={new Date(at).toISOString()}>{new Date(at).toLocaleTimeString()}</time>
          {eligibility.blockNumber !== undefined ? ` at block ${eligibility.blockNumber.toString()}` : ''}
        </>
      ) : (
        'Not checked yet'
      )}
      <button
        type="button"
        className="rb-elig-button rb-elig-button-small"
        onClick={() => void eligibility.refresh()}
        disabled={eligibility.isFetching}
      >
        {eligibility.isFetching ? 'Checking…' : 'Refresh'}
      </button>
    </p>
  );
}

export interface GasWarningProps {
  /** A live USD figure for a plain transfer, from `gasCostUsd` in @gatedpath/chains, if you have one. */
  transferUsd?: string | null;
  className?: string;
}

/**
 * The wallet gas warning from Vine, which every Redbelly dApp should show near its first
 * transaction. See docs/wallet-gas-warning.md for the source and the reasoning.
 */
export function GasWarning({ transferUsd, className }: GasWarningProps) {
  return (
    <p className={cx('rb-elig-gas', className)}>
      Gas on Redbelly is priced in US dollars and paid in RBNT
      {transferUsd ? `; a plain transfer costs about US$${transferUsd} right now` : ''}. Redbelly warns that most wallets
      show gas information wrongly on this network, so trust the figure here over the wallet's, and read{' '}
      <a href={VINE_INTERACTION_URL} target="_blank" rel="noreferrer">
        Vine's note
      </a>{' '}
      and{' '}
      <a href={VINE_FEES_URL} target="_blank" rel="noreferrer">
        how fees work
      </a>
      .
    </p>
  );
}
