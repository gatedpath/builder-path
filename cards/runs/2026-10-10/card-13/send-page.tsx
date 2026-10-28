"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useConnection, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { getAddress, isAddress, parseEther } from "viem";
import { Connect } from "@/components/Connect";
import { FailureWords } from "@/components/FailureWords";
import { useOnAppChain, WrongNetwork } from "@/components/useOnAppChain";
import { chain, permissionAbi, permissionAddress } from "@/lib/chain";

/**
 * A transfer that refuses to lose your money (project 13).
 *
 * Before any RBNT leaves the wallet, this page asks the network two things about the recipient: is
 * there code at the address (a contract, which has never been through the identity gate), and does
 * `permission.isAllowed` say it passed the gate on this chain. The same two questions are asked
 * again, on chain, by the RecipientGuard contract the send goes through, so the page's answer is a
 * courtesy and the contract's is the rule. The answer is cached for thirty seconds per chain and
 * never carried from one chain to another: a wallet enables each network separately.
 *
 * What this does not do: a typo that lands on another real, verified address goes through. The
 * address book is the other half of the answer, and the page says so in words.
 */

type Verdict = "permissioned" | "not-permissioned" | "contract" | "zero";

const guardAddress = (process.env.NEXT_PUBLIC_GUARD_ADDRESS || undefined) as `0x${string}` | undefined;

const guardAbi = [
  {
    type: "function",
    name: "send",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "allowContract", type: "bool" },
    ],
    outputs: [],
  },
] as const;

/** Address book: names the person chose, kept in this browser only, one book per chain. */
function useAddressBook() {
  const key = `recipient-guard-book-${chain.id}`;
  const [book, setBook] = useState<Record<string, `0x${string}`>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setBook(JSON.parse(raw) as Record<string, `0x${string}`>);
    } catch {
      /* no storage: the book is empty for this visit */
    }
  }, [key]);
  const save = (next: Record<string, `0x${string}`>) => {
    setBook(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* no storage: the entry lives until the page is closed */
    }
  };
  return { book, save };
}

function verdictWords(v: Verdict): string {
  switch (v) {
    case "permissioned":
      return "This address has passed the network's identity gate on this chain. Someone verified holds it.";
    case "not-permissioned":
      return "No one verified holds this address on this chain. Money sent here would be gone. The guard will refuse.";
    case "contract":
      return "This is a contract, not a wallet. It has never been through the identity gate. The guard refuses unless you say a contract is what you mean.";
    case "zero":
      return "The zero address. Nothing can be sent here.";
  }
}

export default function SendPage() {
  const { address, isConnected } = useConnection();
  const client = usePublicClient();
  const net = useOnAppChain();
  const { book, save } = useAddressBook();
  const [typed, setTyped] = useState("");
  const [amount, setAmount] = useState("");
  const [allowContract, setAllowContract] = useState(false);
  const [newName, setNewName] = useState("");
  const [simulationError, setSimulationError] = useState<unknown>(null);
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });

  // A name from the book resolves to its address; anything else must be an address as typed.
  const resolved = useMemo<`0x${string}` | null>(() => {
    const t = typed.trim();
    if (book[t]) return book[t];
    return isAddress(t) ? getAddress(t) : null;
  }, [typed, book]);

  const check = useQuery({
    queryKey: ["recipient-check", chain.id, resolved],
    enabled: Boolean(client && resolved),
    staleTime: 30_000,
    queryFn: async (): Promise<Verdict> => {
      if (!client || !resolved) throw new Error("no recipient");
      if (resolved === "0x0000000000000000000000000000000000000000") return "zero";
      const code = await client.getCode({ address: resolved });
      // EIP-7702: a wallet that delegated its code carries 23 bytes beginning 0xef0100. Still a wallet.
      const isDelegatedWallet = code !== undefined && code.length === 2 + 46 && code.toLowerCase().startsWith("0xef0100");
      if (code && code !== "0x" && !isDelegatedWallet) return "contract";
      const allowed = await client.readContract({ address: permissionAddress, abi: permissionAbi, functionName: "isAllowed", args: [resolved] });
      return allowed ? "permissioned" : "not-permissioned";
    },
  });

  const verdict = check.data;
  const canSend =
    Boolean(guardAddress) &&
    Boolean(resolved) &&
    net.onAppChain &&
    amount.trim() !== "" &&
    (verdict === "permissioned" || (verdict === "contract" && allowContract));

  async function sendNow() {
    if (!client || !guardAddress || !resolved || !address) return;
    setSimulationError(null);
    write.reset();
    let value: bigint;
    try {
      value = parseEther(amount.trim());
    } catch {
      setSimulationError(new Error("The amount is not a number of RBNT."));
      return;
    }
    const args = [resolved, allowContract] as const;
    try {
      await client.simulateContract({ account: address, address: guardAddress, abi: guardAbi, functionName: "send", args, value });
    } catch (error) {
      setSimulationError(error);
      return;
    }
    write.mutate({ address: guardAddress, abi: guardAbi, functionName: "send", args, value, chainId: chain.id });
  }

  return (
    <main>
      <h1>Send, with a check first</h1>
      <p className="muted">
        {chain.name} (chain {chain.id}). Before anything is sent, this page asks the network whether the recipient has passed the identity gate
        here. The transfer itself goes through a contract that asks the same question again and refuses if the answer is no.
      </p>
      <p className="muted">
        <strong>What the check stops:</strong> money going to an address nobody holds. <strong>What it does not stop:</strong> money going to the
        wrong person. A typo that lands on another verified address goes through. Use the address book for the people you pay often.
      </p>

      <Connect />

      <div className="card">
        <h2>Recipient</h2>
        <p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="a name from your book, or 0x…"
            style={{ width: "100%" }}
            spellCheck={false}
          />
        </p>
        {resolved && typed.trim() !== resolved && (
          <p className="muted">
            {typed.trim()} is <code>{resolved}</code>
          </p>
        )}
        {typed.trim() !== "" && !resolved && <p className="muted">Not a name in your book and not an address.</p>}
        {resolved && check.isPending && <p className="muted">Asking the network…</p>}
        {resolved && check.error && <p className="muted">Could not read the network: {check.error.message}</p>}
        {resolved && verdict && (
          <p>
            <strong>{verdict === "permissioned" ? "Verified." : verdict === "contract" ? "A contract." : "Refused."}</strong> {verdictWords(verdict)}
          </p>
        )}
        {verdict === "contract" && (
          <p>
            <label>
              <input type="checkbox" checked={allowContract} onChange={(e) => setAllowContract(e.target.checked)} /> Yes, a contract is what I mean to pay.
            </label>
          </p>
        )}
        {resolved && verdict === "permissioned" && !book[typed.trim()] && (
          <p className="muted">
            Save it:{" "}
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="a name" />{" "}
            <button
              disabled={newName.trim() === ""}
              onClick={() => {
                save({ ...book, [newName.trim()]: resolved });
                setTyped(newName.trim());
                setNewName("");
              }}
            >
              Add to the book
            </button>
          </p>
        )}
      </div>

      <div className="card">
        <h2>Amount</h2>
        <p>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="RBNT, for example 0.5" inputMode="decimal" /> RBNT
        </p>
        {!guardAddress && (
          <p className="muted">
            Set NEXT_PUBLIC_GUARD_ADDRESS in web/.env to the address from contracts/deployments/{chain.id}-RecipientGuard.json. Until then the
            page checks and does not send.
          </p>
        )}
        {isConnected && <WrongNetwork net={net} />}
        <button disabled={!isConnected || !canSend || write.isPending} onClick={sendNow}>
          {write.isPending ? "Waiting for the wallet…" : "Send through the guard"}
        </button>
        {simulationError !== null && <FailureWords error={simulationError} className="muted" />}
        {write.error && <FailureWords error={write.error} className="muted" />}
        {receipt.isLoading && <p className="muted">Sent; waiting for the block.</p>}
        {receipt.isSuccess && (
          <p>
            Done. Transaction <code>{write.data}</code>.
          </p>
        )}
      </div>

      {Object.keys(book).length > 0 && (
        <div className="card">
          <h2>Your address book</h2>
          <p className="muted">Kept in this browser only, for chain {chain.id}. Nothing here is sent anywhere.</p>
          <ul>
            {Object.entries(book).map(([name, addr]) => (
              <li key={name}>
                <button onClick={() => setTyped(name)}>{name}</button> <code>{addr}</code>{" "}
                <button
                  onClick={() => {
                    const next = { ...book };
                    delete next[name];
                    save(next);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
