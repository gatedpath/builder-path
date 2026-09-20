"use client";

import "@gatedpath/frontend-kit/styles.css";
import { useEffect, useMemo, useState } from "react";
import { useConnection, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { gasCostUsd } from "@gatedpath/chains";
import { EligibilityGate, GasWarning, LastChecked, receptorMockExpiry, useEligibility } from "@gatedpath/frontend-kit";
import { Connect } from "@/components/Connect";
import { FailureWords } from "@/components/FailureWords";
import { DevState } from "@/components/DevState";
import { useOnAppChain, WrongNetwork } from "@/components/useOnAppChain";
import { chain } from "@/lib/chain";
import { contract } from "@/contract";

/**
 * The frontend kit's demo page: the connected wallet through the five eligibility states
 * (not connected, not verified on the network, ineligible for this action, eligible, expiring
 * soon), read from the template contract's own verifier and request id. The contract's gate is
 * still the real check; this page decides what the button says.
 *
 * `expiring` only shows when the verifier can tell. On testnet the first deploy uses a
 * ReceptorMock, which exposes expiry; on mainnet the verifier is an adapter over a real one,
 * which does not, so `expiry` is left unset there.
 */
export default function EligibilityPage() {
  const { address, isConnected } = useConnection();
  const client = usePublicClient();
  const configured = Boolean(contract.address);

  const verifier = useReadContract({
    address: contract.address,
    abi: contract.abi,
    functionName: "verifier",
    query: { enabled: configured },
  });
  const requestId = useReadContract({
    address: contract.address,
    abi: contract.abi,
    functionName: "requestId",
    query: { enabled: configured },
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

  const [usd, setUsd] = useState<string | null>(null);
  useEffect(() => {
    gasCostUsd({ gasUsed: 21_000, rpc: chain.rpcUrls.default.http[0] })
      .then((c) => setUsd(c.usd.toFixed(4)))
      .catch(() => setUsd(null));
  }, []);

  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });
  // `refresh` is stable; the `eligibility` object is rebuilt on every fetch, and depending on it
  // refetched in a tight loop for as long as the receipt stayed successful (audit of 2026-09-19).
  const refreshEligibility = eligibility.refresh;
  useEffect(() => {
    if (receipt.isSuccess) void refreshEligibility();
  }, [receipt.isSuccess, refreshEligibility]);
  const net = useOnAppChain();

  // Simulate first, then write: a revert (NotEligible, a closed gate) surfaces here as a decoded
  // error with its data, instead of a transaction the node mines with status 0 and no words.
  const [simulationError, setSimulationError] = useState<unknown>(null);
  async function act() {
    if (!client || !address || !contract.address || !net.onAppChain) return;
    setSimulationError(null);
    write.reset();
    try {
      await client.simulateContract({ account: address, address: contract.address, abi: contract.abi, functionName: contract.actionFunction, args: [] });
    } catch (error) {
      setSimulationError(error);
      return;
    }
    write.mutate({ address: contract.address, abi: contract.abi, functionName: contract.actionFunction, args: [], chainId: chain.id });
  }

  return (
    <main>
      <h1>Eligibility</h1>
      <p className="muted">
        {chain.name} (chain {chain.id}). One wallet, five states, read from {contract.name}&apos;s verifier and request id.
      </p>

      <Connect />
      <DevState />

      {!configured && (
        <p className="muted">
          Set NEXT_PUBLIC_CONTRACT_ADDRESS in web/.env after your first testnet deploy; until then there is no verifier to ask.
        </p>
      )}

      {configured && (
        <>
          <EligibilityGate
            eligibility={eligibility}
            address={isConnected ? address : undefined}
            chainName={chain.name}
            testnet={chain.testnet === true}
            requirement={`request id ${requestId.data?.toString() ?? "?"} on ${contract.name}`}
          >
            <button
              className="rb-elig-button"
              disabled={!net.onAppChain || write.isPending || receipt.isLoading}
              onClick={() => void act()}
            >
              {write.isPending ? "Confirm in wallet…" : receipt.isLoading ? "Waiting for the block…" : contract.actionLabel}
            </button>
            <WrongNetwork net={net} />
            {(simulationError || write.error) && <FailureWords error={simulationError ?? write.error} />}
            {receipt.isSuccess && receipt.data.status === "reverted" && (
              <p className="rb-elig-muted">The transaction was mined but reverted (status 0). explain_failure in the MCP server, given its hash, replays it and names the reason.</p>
            )}
            {receipt.isSuccess && receipt.data.status === "success" && <p className="rb-elig-muted">Done in block {receipt.data.blockNumber.toString()}.</p>}
          </EligibilityGate>
          <LastChecked eligibility={eligibility} />
        </>
      )}

      <GasWarning transferUsd={usd} />
    </main>
  );
}
