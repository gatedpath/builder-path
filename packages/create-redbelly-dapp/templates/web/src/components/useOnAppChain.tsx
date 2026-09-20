"use client";

import { useConnection, useSwitchChain } from "wagmi";
import { chain } from "@/lib/chain";

/**
 * Is the wallet on the network this app talks to? The app reads from its own RPC, so every read can
 * pass while the wallet sits on another network entirely; a first-time user's wallet is on
 * Ethereum, because Redbelly is pre-configured nowhere. A write must not be offered until this says
 * yes, and every write also passes `chainId: chain.id` so the wallet refuses rather than signs on
 * the wrong network.
 */
export function useOnAppChain() {
  const { chainId, isConnected } = useConnection();
  const switcher = useSwitchChain();
  return {
    onAppChain: isConnected && chainId === chain.id,
    walletChainId: chainId,
    switching: switcher.isPending,
    switchError: switcher.error,
    /** Asks the wallet to switch; wagmi offers to add the network when the wallet does not know it. */
    switchToAppChain: () => switcher.mutate({ chainId: chain.id }),
  };
}

/** The line and the button shown in place of an action while the wallet is on another network. */
export function WrongNetwork({ net }: { net: ReturnType<typeof useOnAppChain> }) {
  if (net.onAppChain) return null;
  return (
    <p className="muted">
      Your wallet is on chain {String(net.walletChainId ?? "unknown")}; this app is on {chain.name} ({chain.id}). Nothing is sent until they match.{" "}
      <button onClick={net.switchToAppChain} disabled={net.switching}>
        {net.switching ? "Switching…" : `Switch to ${chain.name}`}
      </button>
      {net.switchError && <> The wallet refused: {net.switchError.message}</>}
    </p>
  );
}
