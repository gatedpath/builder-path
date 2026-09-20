// A small in-process signal: something changed a wallet's eligibility and every `useEligibility`
// for that wallet should read again now, without waiting for the next block or the refresh
// interval. `DevStatePanel` fires it after `setStatus` lands on a local Anvil; an app can fire it
// after its own transaction the same way. No network, no storage, nothing leaves the tab.
import type { Address } from './useEligibility.js';

type Listener = (address: Address | undefined) => void;

const listeners = new Set<Listener>();

/** Tells every mounted `useEligibility` for `address` (or every one, when omitted) to refetch. */
export function notifyEligibilityChanged(address?: Address): void {
  for (const listener of listeners) listener(address);
}

/** Subscribes; returns the unsubscribe function. Used by `useEligibility`. */
export function onEligibilityChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
