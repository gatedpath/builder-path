"use client";

import { useConnection } from "wagmi";
import { Connect } from "@/components/Connect";
import { VerifyWallet } from "@/components/VerifyWallet";
import { GatedAction } from "@/components/GatedAction";
import { GasNote } from "@/components/GasNote";
import { DevState } from "@/components/DevState";
import { useIsAllowed } from "@/components/useIsAllowed";
import { chain } from "@/lib/chain";

export default function Home() {
  const { address, isConnected } = useConnection();
  const allowed = useIsAllowed(address);

  return (
    <main>
      <h1>__PROJECT_NAME__</h1>
      <p className="muted">
        {chain.name} (chain {chain.id}). Every wallet here is identity-verified before it can transact; this app checks that first, then offers one gated action.
      </p>

      <Connect />
      <DevState />

      {isConnected && address && allowed.data === false && <VerifyWallet address={address} />}

      {isConnected && address && allowed.data === true && <GatedAction address={address} />}

      {isConnected && allowed.isPending && <p className="muted">Checking permission.isAllowed…</p>}
      {isConnected && allowed.error && (
        <p className="muted">Could not read permission.isAllowed: {allowed.error.message}</p>
      )}

      <GasNote />

      <p className="muted">
        <a href="/eligibility">/eligibility</a> shows the same wallet through the frontend kit&apos;s five states.
      </p>
    </main>
  );
}
