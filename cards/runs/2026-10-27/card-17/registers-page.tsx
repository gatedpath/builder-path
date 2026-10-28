"use client";

import "@gatedpath/frontend-kit/styles.css";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { identityRegistryAbi, trustedIssuersRegistryAbi, useRegister } from "@gatedpath/frontend-kit";
import { Connect } from "@/components/Connect";
import { useIsAllowed } from "@/components/useIsAllowed";
import { chain } from "@/lib/chain";
import { REGISTER_CANDIDATES_CHECKED, registerCandidates } from "@/lib/registers";

/**
 * The register explorer: every ERC-3643 register on the chain this app points at, read through the
 * kit's `useRegister`, one hook per register, and for the connected wallet whether each register's
 * identity registry has verified it. Read-only. Nothing is written, nothing leaves the browser but
 * reads of the public RPC, and every figure carries the block it was read at.
 *
 * Three gates, and which question each answers:
 *   the network gate   permission.isAllowed(wallet): may this wallet transact on the chain at all
 *   a recipe gate      a dApp's verifier and request id (see /eligibility): may it use that dApp
 *   the register gate  identityRegistry.isVerified(wallet): may it hold this particular asset
 * This page reads the first and the third. The second belongs to each dApp.
 */
export default function RegistersPage() {
  const { address, isConnected } = useConnection();
  const wallet = isConnected ? address : undefined;
  const candidates = chain.id === 151 || chain.id === 153 ? registerCandidates[chain.id] : [];
  const allowed = useIsAllowed(wallet);
  const [found, setFound] = useState<Record<string, boolean>>({});
  const onAnswer = useCallback((token: string, isRegister: boolean) => setFound((f) => (f[token] === isRegister ? f : { ...f, [token]: isRegister })), []);
  const registerCount = Object.values(found).filter(Boolean).length;
  const answered = Object.keys(found).length;

  return (
    <main>
      <h1>Registers</h1>
      <p className="muted">
        {chain.name} (chain {chain.id}). Every ERC-3643 register this app can see, read live through the kit&apos;s register
        reader. Nothing here writes; the only traffic is reads of the public RPC.
      </p>

      <div className="card">
        <p>
          <strong>Mainnet (151) is the chain with registers on it today.</strong> The candidate list holds {registerCandidates[151].length} mainnet
          addresses from the census of {REGISTER_CANDIDATES_CHECKED} and none for testnet. Reading mainnet signs nothing: a
          read-only page needs no wallet on that chain and sends no transaction.
          {chain.id !== 151 && (
            <>
              {" "}
              This app points at chain {chain.id}; to read the mainnet registers, build or run it with{" "}
              <code>NEXT_PUBLIC_CHAIN_ID=151</code>.
            </>
          )}
        </p>
      </div>

      <h2>Three gates</h2>
      <p className="muted">
        <strong>The network gate</strong> is <code>permission.isAllowed</code>: may this wallet transact on the chain at all.{" "}
        <strong>A recipe gate</strong> is a dApp&apos;s verifier and request id (<a href="/eligibility">/eligibility</a> shows this
        app&apos;s): may it use that dApp. <strong>The register gate</strong> is each register&apos;s own identity registry: may it
        hold that asset. This page answers the first and the third.
      </p>

      <Connect />

      {wallet && (
        <div className="card">
          <p>
            <strong>The network gate</strong> for <code>{wallet}</code>:{" "}
            {allowed.isPending && "checking permission.isAllowed…"}
            {allowed.data === true && "allowed to transact on this chain."}
            {allowed.data === false && "not allowed to transact on this chain (not verified at access.redbelly.network)."}
            {allowed.error && `could not be read: ${allowed.error.message}`}
          </p>
          <p className="muted">The register gate is answered per register below, in the kit&apos;s own words for the wallet&apos;s state.</p>
        </div>
      )}

      <h2>
        {candidates.length === 0
          ? `No candidate registers on chain ${chain.id}`
          : `${registerCount} of ${candidates.length} candidates answer as registers${answered < candidates.length ? ` (${candidates.length - answered} still being read)` : ""}`}
      </h2>

      {candidates.map((token) => (
        <RegisterRow key={token} token={token} wallet={wallet} onAnswer={onAnswer} />
      ))}
    </main>
  );
}

function RegisterRow({ token, wallet, onAnswer }: { token: Address; wallet: Address | undefined; onAnswer: (token: string, isRegister: boolean) => void }) {
  const r = useRegister(token, wallet);
  const registry = r.token.identityRegistry ?? undefined;
  const isRegister = r.state !== "checking" && r.state !== "not-a-register" && r.state !== "error" && registry !== undefined;

  // Report once the chain has answered, so the heading's count comes from reads and not from the
  // list. In an effect, never during render: a child must not set its parent's state while rendering.
  const settled = r.state !== "checking" && r.state !== "disconnected" && r.state !== "error";
  useEffect(() => {
    if (settled) onAnswer(token, isRegister);
  }, [settled, isRegister, onAnswer, token]);

  const storage = useReadContract({
    address: registry,
    abi: identityRegistryAbi,
    functionName: "identityStorage",
    query: { enabled: Boolean(registry) },
  });
  const issuersRegistry = useReadContract({
    address: registry,
    abi: identityRegistryAbi,
    functionName: "issuersRegistry",
    query: { enabled: Boolean(registry) },
  });
  const issuerTopics = useReadContracts({
    contracts: r.registry.trustedIssuers.map((issuer) => ({
      address: issuersRegistry.data as Address,
      abi: trustedIssuersRegistryAbi,
      functionName: "getTrustedIssuerClaimTopics" as const,
      args: [issuer] as const,
    })),
    query: { enabled: Boolean(issuersRegistry.data) && r.registry.trustedIssuers.length > 0 },
  });
  const country = useReadContract({
    address: registry,
    abi: identityRegistryAbi,
    functionName: "investorCountry",
    args: wallet ? [wallet] : undefined,
    query: { enabled: Boolean(registry && wallet && r.wallet?.registered) },
  });

  if (r.state === "checking") {
    return (
      <div className="card">
        <p className="muted">
          <code>{token}</code> reading…
        </p>
      </div>
    );
  }
  if (r.state === "error") {
    return (
      <div className="card">
        <p className="muted">
          <code>{token}</code> could not be read: {r.error?.message}
        </p>
      </div>
    );
  }
  if (!isRegister) {
    return (
      <div className="card">
        <p className="muted">
          <code>{token}</code> is not a register: <code>identityRegistry()</code> does not answer with a contract (block {r.blockNumber?.toString() ?? "?"}).
        </p>
      </div>
    );
  }

  const supply = r.token.totalSupply !== null && r.token.decimals !== null ? formatUnits(r.token.totalSupply, r.token.decimals) : "?";
  const at = `block ${r.blockNumber?.toString() ?? "?"}`;

  return (
    <div className="card">
      <p>
        <strong>{r.token.name ?? "(no name)"}</strong> {r.token.symbol ? `(${r.token.symbol})` : ""} <code>{token}</code>
      </p>
      <p className="muted">
        Supply {supply} ({r.token.decimals ?? "?"} decimals) · T-REX {r.token.version ?? "?"} ·{" "}
        {r.token.paused === null ? "pause state unknown" : r.token.paused ? "paused" : "not paused"} · gate kind: <strong>{r.registry.gate ?? "?"}</strong> · read
        at {at}
      </p>
      <p className="muted">
        Identity registry <code>{registry}</code>; its storage {storage.data ? <code>{storage.data as string}</code> : "(reading)"}.
      </p>
      <p className="muted">
        Trusted issuers:{" "}
        {r.registry.trustedIssuers.length === 0
          ? "none"
          : r.registry.trustedIssuers.map((issuer, i) => {
              const topics = issuerTopics.data?.[i]?.result as readonly bigint[] | undefined;
              return (
                <span key={issuer}>
                  <code>{issuer}</code> for topics {topics ? (topics.length ? topics.map(String).join(", ") : "none") : "(reading)"}
                  {i < r.registry.trustedIssuers.length - 1 ? "; " : ""}
                </span>
              );
            })}
        . Required claim topics: {r.registry.claimTopics.length === 0 ? "none" : r.registry.claimTopics.map(String).join(", ")}.
      </p>
      {wallet && r.wallet && (
        <p>
          <strong>The register gate</strong> for your wallet: <strong>{r.state}</strong> ·{" "}
          {r.wallet.isVerified === null ? "verified: unknown" : r.wallet.isVerified ? "verified by this registry" : "not verified by this registry"} ·{" "}
          {r.wallet.registered ? `country code ${country.data === undefined ? "(reading)" : String(country.data)}` : "no identity registered"} ·{" "}
          {r.wallet.frozen === null ? "frozen: unknown" : r.wallet.frozen ? "frozen" : "not frozen"} · balance{" "}
          {r.wallet.balance !== null && r.token.decimals !== null ? formatUnits(r.wallet.balance, r.token.decimals) : "?"} · read at {at}
        </p>
      )}
    </div>
  );
}

/** Integer-safe units: the supply as a string with the token's decimals, no floating point. */
function formatUnits(value: bigint, decimals: number): string {
  const s = value.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
