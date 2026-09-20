"use client";

import { useEffect, useState } from "react";
import { gasCostUsd } from "@gatedpath/chains";
import { chain } from "@/lib/chain";

/**
 * Vine warns that most wallets show gas information wrongly on Redbelly: fees are priced in
 * US dollars and converted to RBNT at execution. So the app prices a transfer itself from the
 * on-chain feed instead of trusting the wallet's display.
 */
export function GasNote() {
  const [usd, setUsd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    gasCostUsd({ gasUsed: 21_000, rpc: chain.rpcUrls.default.http[0] })
      .then((c) => setUsd(c.usd.toFixed(4)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <p className="muted">
      Gas here is priced in US dollars and paid in RBNT. A plain transfer costs about
      {usd ? ` US$${usd}` : error ? " US$0.01 (live read failed)" : " …"} right now; your wallet&apos;s own gas display may be wrong on this network.
    </p>
  );
}
