"use client";

import { ACCESS_URL, FAUCET_URL, chain } from "@/lib/chain";

/**
 * The interstitial every Redbelly dApp needs: the wallet is connected but the network
 * won't accept a transaction from it until identity verification is done. Links out to the
 * Access dApp; the page keeps polling isAllowed and clears itself when it turns true.
 */
export function VerifyWallet({ address }: { address: `0x${string}` }) {
  return (
    <div className="card">
      <h2>Verify your wallet</h2>
      <p>
        <code>{address}</code> is not yet allowed to transact on {chain.name}. Redbelly gates every wallet behind a one-time
        identity check; this app never sees your documents, only a true or false from the network.
      </p>
      <ol>
        <li>
          Open <a href={ACCESS_URL} target="_blank" rel="noreferrer">{ACCESS_URL}</a> with this same wallet and complete verification.
        </li>
        <li>
          On testnet, get RBNT from <a href={FAUCET_URL} target="_blank" rel="noreferrer">FAUCETME</a> so you can pay gas.
        </li>
        <li>Come back here. This page re-checks every five seconds and moves on by itself.</li>
      </ol>
      <p className="muted">Don&apos;t switch to another wallet to get past this: the credential belongs to the wallet that was verified.</p>
    </div>
  );
}
