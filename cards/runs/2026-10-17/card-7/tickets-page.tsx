"use client";

import "@gatedpath/frontend-kit/styles.css";
import { useMemo, useState } from "react";
import { formatEther, parseEther } from "viem";
import {
  useConnection,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { EligibilityGate, LastChecked, receptorMockExpiry, useEligibility } from "@gatedpath/frontend-kit";
import { Connect } from "@/components/Connect";
import { DevState } from "@/components/DevState";
import { FailureWords } from "@/components/FailureWords";
import { GasNote } from "@/components/GasNote";
import { useOnAppChain, WrongNetwork } from "@/components/useOnAppChain";
import { chain } from "@/lib/chain";
import { contract } from "@/contract";

/**
 * Card 7: an event ticket with an age gate. The connected wallet is shown in the three states the
 * card asks for, through the frontend kit's `useEligibility` and `EligibilityGate`: not verified
 * on the network (permission.isAllowed is false), verified but ineligible (the ticket's verifier
 * says no for the over-18 request), and eligible (the purchase and the resale buy are offered).
 * Below the gate, the wallet's own tickets with their check-in state and a resale box that shows
 * the cap and refuses a higher price before anything is signed. The contract's gate and cap are
 * the real checks; this page decides what the buttons say.
 */
export default function TicketsPage() {
  const { address, isConnected } = useConnection();
  const client = usePublicClient();
  const net = useOnAppChain();
  const configured = Boolean(contract.address);
  const base = { address: contract.address, abi: contract.abi } as const;

  const verifier = useReadContract({ ...base, functionName: "verifier", query: { enabled: configured } });
  const requestId = useReadContract({ ...base, functionName: "requestId", query: { enabled: configured } });
  const faceValue = useReadContract({ ...base, functionName: "faceValue", query: { enabled: configured } });
  const resaleCap = useReadContract({ ...base, functionName: "resaleCap", query: { enabled: configured } });
  const salesOpen = useReadContract({ ...base, functionName: "salesOpen", query: { enabled: configured } });
  const minted = useReadContract({ ...base, functionName: "minted", query: { enabled: configured } });
  const maxSupply = useReadContract({ ...base, functionName: "maxSupply", query: { enabled: configured } });
  const balance = useReadContract({
    ...base,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: configured && Boolean(address) },
  });

  const expiry = useMemo(() => {
    if (!client || !chain.testnet || !verifier.data) return undefined;
    return receptorMockExpiry(client, verifier.data as `0x${string}`);
  }, [client, verifier.data]);

  const eligibility = useEligibility(
    isConnected ? address : undefined,
    verifier.data as `0x${string}` | undefined,
    requestId.data as bigint | undefined,
    { expiry },
  );

  // The wallet's tickets: ids by index, then each one's check-in flag and standing offer.
  const count = Number((balance.data as bigint | undefined) ?? 0n);
  const ids = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({ ...base, functionName: "tokenOfOwnerByIndex", args: [address, BigInt(i)] })),
    query: { enabled: configured && count > 0 },
  });
  const tokenIds = (ids.data ?? []).map((r) => r.result as bigint | undefined).filter((x): x is bigint => x !== undefined);
  const details = useReadContracts({
    contracts: tokenIds.flatMap((id) => [
      { ...base, functionName: "checkedIn", args: [id] },
      { ...base, functionName: "listings", args: [id] },
    ]),
    query: { enabled: tokenIds.length > 0 },
  });

  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });
  const [simulationError, setSimulationError] = useState<unknown>(null);
  const [resaleId, setResaleId] = useState("");
  const [resalePrice, setResalePrice] = useState("");
  const [buyId, setBuyId] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const offer = useReadContract({
    ...base,
    functionName: "listings",
    args: /^\d+$/.test(buyId) ? [BigInt(buyId)] : undefined,
    query: { enabled: configured && /^\d+$/.test(buyId) },
  });
  const offerListed = Array.isArray(offer.data) ? Boolean(offer.data[0]) : false;
  const offerPrice = Array.isArray(offer.data) ? (offer.data[1] as bigint) : undefined;

  const refreshAll = async () => {
    await Promise.all([eligibility.refresh(), balance.refetch(), minted.refetch(), ids.refetch(), details.refetch(), offer.refetch()]);
  };

  // Simulate first, then write: a revert (NotEligible, AboveResaleCap, TicketUsed) surfaces here
  // with its data, instead of a transaction the node mines with status 0 and no words.
  async function send(functionName: string, args: unknown[], value?: bigint) {
    if (!client || !address || !contract.address || !net.onAppChain) return;
    setSimulationError(null);
    setLocalError(null);
    write.reset();
    try {
      await client.simulateContract({ account: address, address: contract.address, abi: contract.abi, functionName, args, value });
    } catch (error) {
      setSimulationError(error);
      return;
    }
    write.mutate(
      { address: contract.address, abi: contract.abi, functionName, args, value, chainId: chain.id },
      { onSuccess: () => void refreshAll() },
    );
  }

  function listForResale() {
    if (!/^\d+$/.test(resaleId)) return setLocalError("Enter one of your ticket ids.");
    let price: bigint;
    try {
      price = parseEther(resalePrice || "0");
    } catch {
      return setLocalError(`Enter a price in ${chain.nativeCurrency.symbol}, for example 1.05.`);
    }
    const cap = resaleCap.data as bigint | undefined;
    if (cap !== undefined && price > cap) {
      return setLocalError(`${formatEther(price)} is above the resale cap of ${formatEther(cap)} ${chain.nativeCurrency.symbol}. The contract would refuse it too.`);
    }
    void send("list", [BigInt(resaleId), price]);
  }

  const symbol = chain.nativeCurrency.symbol;
  const busy = write.isPending || receipt.isLoading;

  return (
    <main>
      <h1>Tickets</h1>
      <p className="muted">
        {chain.name} (chain {chain.id}). An ERC-721 ticket whose purchase needs the over-18 credential, whose resale is capped at{" "}
        {resaleCap.data !== undefined && faceValue.data !== undefined
          ? `${formatEther(resaleCap.data as bigint)} ${symbol} (face value ${formatEther(faceValue.data as bigint)} ${symbol})`
          : "a set percentage of face value"}
        , and which stops moving once it has been through the door. The organiser never sees a birth date: the contract asks the verifier for a yes or a no.
      </p>

      <Connect />
      <DevState />

      {!configured && (
        <p className="muted">Set NEXT_PUBLIC_CONTRACT_ADDRESS in web/.env after a deploy; until then there is no contract to read.</p>
      )}

      {configured && (
        <>
          <EligibilityGate
            eligibility={eligibility}
            address={isConnected ? address : undefined}
            chainName={chain.name}
            testnet={chain.testnet === true}
            requirement={`an over-18 credential (request id ${requestId.data?.toString() ?? "?"} on ${contract.name})`}
          >
            <div className="card">
              <h2>Buy a ticket</h2>
              <p className="rb-elig-muted">
                {salesOpen.data === false
                  ? "The sale is closed."
                  : `${String(minted.data ?? "?")} of ${String(maxSupply.data ?? "?")} sold. One ticket costs ${
                      faceValue.data !== undefined ? formatEther(faceValue.data as bigint) : "?"
                    } ${symbol}.`}
              </p>
              <button
                className="rb-elig-button"
                disabled={!net.onAppChain || busy || faceValue.data === undefined || salesOpen.data !== true}
                onClick={() => void send("purchase", [], faceValue.data as bigint)}
              >
                {write.isPending ? "Confirm in wallet…" : receipt.isLoading ? "Waiting for the block…" : "Buy a ticket"}
              </button>
            </div>

            <div className="card">
              <h2>Buy a resold ticket</h2>
              <p className="rb-elig-muted">
                A holder lists a ticket at or under the cap; you pay exactly that and the seller is paid in the same transaction. The cap is checked inside the transfer, not only here.
              </p>
              <input value={buyId} onChange={(e) => setBuyId(e.target.value)} placeholder="ticket id" inputMode="numeric" />
              {/^\d+$/.test(buyId) && offer.data !== undefined && (
                <p className="rb-elig-muted">
                  {offerListed ? `Ticket ${buyId} is listed at ${formatEther(offerPrice ?? 0n)} ${symbol}.` : `Ticket ${buyId} is not for sale.`}
                </p>
              )}
              <button
                className="rb-elig-button"
                disabled={!net.onAppChain || busy || !offerListed || offerPrice === undefined}
                onClick={() => void send("buy", [BigInt(buyId)], offerPrice)}
              >
                Buy ticket {buyId || "…"}
              </button>
            </div>
          </EligibilityGate>
          <LastChecked eligibility={eligibility} />

          {isConnected && address && (
            <div className="card">
              <h2>Your tickets</h2>
              {count === 0 && <p className="muted">None in this wallet.</p>}
              {tokenIds.map((id, i) => {
                const used = Boolean(details.data?.[2 * i]?.result);
                const listing = details.data?.[2 * i + 1]?.result as readonly [boolean, bigint] | undefined;
                return (
                  <p key={id.toString()}>
                    Ticket <code>{id.toString()}</code>:{" "}
                    {used ? "checked in; it cannot be listed, sold or moved again" : "not yet checked in"}
                    {!used && listing?.[0] && ` and listed at ${formatEther(listing[1])} ${symbol}`}
                    {!used && listing?.[0] && (
                      <>
                        {" "}
                        <button disabled={!net.onAppChain || busy} onClick={() => void send("delist", [id])}>
                          Delist
                        </button>
                      </>
                    )}
                    .
                  </p>
                );
              })}
              <h3>List one for resale</h3>
              <p className="muted">
                Up to {resaleCap.data !== undefined ? formatEther(resaleCap.data as bigint) : "?"} {symbol}. Zero is a gift. A checked-in ticket cannot be listed.
              </p>
              <input value={resaleId} onChange={(e) => setResaleId(e.target.value)} placeholder="ticket id" inputMode="numeric" />{" "}
              <input value={resalePrice} onChange={(e) => setResalePrice(e.target.value)} placeholder={`price in ${symbol}`} inputMode="decimal" />{" "}
              <button disabled={!net.onAppChain || busy} onClick={listForResale}>
                List
              </button>
              {localError && <p className="muted">{localError}</p>}
            </div>
          )}

          <WrongNetwork net={net} />
          {(simulationError || write.error) && <FailureWords error={simulationError ?? write.error} className="muted" />}
          {receipt.isSuccess && receipt.data.status === "reverted" && (
            <p className="muted">The transaction was mined but reverted (status 0). explain_failure in the MCP server, given its hash, replays it and names the reason.</p>
          )}
          {receipt.isSuccess && receipt.data.status === "success" && <p className="muted">Done in block {receipt.data.blockNumber.toString()}.</p>}

          <p className="muted">
            Check-in and refunds are the organiser&apos;s calls (<code>checkIn</code> for the door wallet, <code>refund</code> for the organiser) and are not on this page; the rehearsal makes them with cast. There is no per-wallet ticket limit, on purpose: the credential proves this wallet is verified, not that two wallets are different people. The comment in <code>purchase()</code> says so.
          </p>
        </>
      )}

      <GasNote />
    </main>
  );
}
