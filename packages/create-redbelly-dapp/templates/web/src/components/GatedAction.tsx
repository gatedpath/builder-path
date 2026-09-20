"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { chain } from "@/lib/chain";
import { contract } from "@/contract";
import { FailureWords } from "@/components/FailureWords";
import { useOnAppChain, WrongNetwork } from "@/components/useOnAppChain";

/**
 * One gated action wired to the template contract. The contract's `gated` modifier is the
 * real check; the read-only `can*` view only decides what the button says. If the wallet
 * isn't eligible for this action the transaction reverts with NotEligible(wallet, requestId), and
 * FailureWords turns that revert into the plain words from the shared failure table.
 */
export function GatedAction({ address }: { address: `0x${string}` }) {
  const configured = Boolean(contract.address);
  const can = useReadContract({
    address: contract.address,
    abi: contract.abi,
    functionName: contract.canFunction,
    args: [address],
    query: { enabled: configured },
  });
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });
  const client = usePublicClient();
  const net = useOnAppChain();
  const [simulationError, setSimulationError] = useState<unknown>(null);

  useEffect(() => {
    if (receipt.isSuccess) void can.refetch();
  }, [receipt.isSuccess, can]);

  // Simulate first, then write: a revert surfaces here with its data and FailureWords explains it,
  // instead of a transaction the node mines with status 0 and no words.
  async function act() {
    if (!client || !contract.address || !net.onAppChain) return;
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

  if (!configured) {
    return (
      <div className="card">
        <h2>{contract.actionLabel}</h2>
        <p className="muted">
          Set NEXT_PUBLIC_CONTRACT_ADDRESS in web/.env to the address from contracts/deployments/{chain.id}-{contract.name}.json after
          your first testnet deploy.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>{contract.actionLabel}</h2>
      <p className="muted">
        {contract.name} at <code>{contract.address}</code> on {chain.name}. {contract.description}
      </p>
      <button
        className="primary"
        disabled={!net.onAppChain || can.data !== true || write.isPending || receipt.isLoading}
        onClick={() => void act()}
      >
        {write.isPending ? "Confirm in wallet…" : receipt.isLoading ? "Waiting for the block…" : contract.actionLabel}
      </button>
      <WrongNetwork net={net} />
      {can.data === false && <p className="muted">{contract.ineligibleHint}</p>}
      {(simulationError || write.error) && <FailureWords error={simulationError ?? write.error} className="muted" />}
      {receipt.isSuccess && receipt.data.status === "reverted" && (
        <p className="muted">The transaction was mined but reverted (status 0). explain_failure in the MCP server, given its hash, replays it and names the reason.</p>
      )}
      {receipt.isSuccess && receipt.data.status === "success" && (
        <p>
          Done in block {receipt.data.blockNumber.toString()}.{" "}
          <a href={`${chain.blockExplorers?.default.url}/tx/${write.data}`} target="_blank" rel="noreferrer">
            View on Routescan
          </a>
        </p>
      )}
    </div>
  );
}
