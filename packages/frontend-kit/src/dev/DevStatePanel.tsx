'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChainId, useClient, useConnect, useConnection, useDisconnect } from 'wagmi';
import { encodeFunctionData, type Client, type Hex } from 'viem';
import { readContract, waitForTransactionReceipt } from 'viem/actions';
import { receptorMockStatusAbi } from '../abi.js';
import { notifyEligibilityChanged } from '../events.js';
import { anvilAccountConnector } from './anvilConnector.js';
import { ELIGIBILITY_STATES, LOCAL_CHAIN_ID, type EligibilityStateName, type LocalDeployment } from './localDeployment.js';

export interface DevStatePanelProps {
  /** The parsed `deployments/local.json`; see `parseLocalDeployment`. */
  deployment: LocalDeployment;
  className?: string;
}

const STATE_HINT: Record<EligibilityStateName, string> = {
  NeverIssued: 'no credential',
  Valid: 'passes the gate',
  Expired: 'credential past its window',
  Revoked: 'issuer revoked it',
  WrongJurisdiction: 'credential does not satisfy the query',
};

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Sends one JSON-RPC request through wagmi's client for the local chain, methods Anvil adds included. */
function rpc(client: Client, method: string, params: unknown[] = []): Promise<unknown> {
  return (client.request as (args: { method: string; params?: unknown[] }) => Promise<unknown>)({ method, params });
}

/**
 * The dev-only state switcher (PLAN.md 18.1). Lists the five wallets `npm run dev` seeded, marks
 * the connected one, and flips the connected wallet through the five credential states by calling
 * `setStatus` on the `ReceptorMock` as the deployer, through Anvil's impersonation RPC. Every
 * mounted `useEligibility` for that wallet refetches on the resulting signal, so the page moves
 * into the new state without a reload.
 *
 * It renders only when the wallet (or, unconnected, the app) is on chain 31337 and the deployment
 * it was given says 31337 too. On 151 or 153 it renders nothing, whatever it was given. In a
 * scaffold it is imported only by the dev server and is absent from production bundles; the
 * scaffolder's test asserts both.
 */
export function DevStatePanel({ deployment, className }: DevStatePanelProps) {
  const configChainId = useChainId();
  const connection = useConnection();
  const chainId = connection.chainId ?? configChainId;
  const onLocal = chainId === LOCAL_CHAIN_ID && deployment.chainId === LOCAL_CHAIN_ID;
  const client = useClient({ chainId: LOCAL_CHAIN_ID });
  const connect = useConnect();
  const disconnect = useDisconnect();

  const [states, setStates] = useState<Record<string, EligibilityStateName>>(() =>
    Object.fromEntries(deployment.wallets.map((w) => [w.address.toLowerCase(), w.state])),
  );
  const [busy, setBusy] = useState<EligibilityStateName | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const requestId = BigInt(deployment.requestId);
  const connected = connection.address?.toLowerCase();

  const readStates = useCallback(async () => {
    if (!client || !onLocal) return;
    const next: Record<string, EligibilityStateName> = {};
    const targets = [...deployment.wallets.map((w) => w.address), ...(connection.address ? [connection.address] : [])];
    for (const address of targets) {
      const status = await readContract(client, {
        address: deployment.verifier,
        abi: receptorMockStatusAbi,
        functionName: 'eligibilityStatus',
        args: [address, requestId],
      });
      next[address.toLowerCase()] = ELIGIBILITY_STATES[Number(status)] ?? 'NeverIssued';
    }
    setStates((prev) => ({ ...prev, ...next }));
  }, [client, onLocal, deployment.wallets, deployment.verifier, requestId, connection.address]);

  useEffect(() => {
    void readStates().catch((e: unknown) => setMessage(e instanceof Error ? e.message : String(e)));
  }, [readStates]);

  const setState = useCallback(
    async (state: EligibilityStateName) => {
      if (!client || !connection.address) return;
      const wallet = connection.address;
      const deployer = deployment.deployer.address;
      setBusy(state);
      setMessage(null);
      try {
        // The mock has no owner: any sender may call setStatus. The deployer is used because it is the
        // account npm run dev funded and deployed from, and impersonation keeps that true whatever
        // wallet is connected. Nothing here signs; Anvil does.
        await rpc(client, 'anvil_impersonateAccount', [deployer]);
        let hash: Hex;
        try {
          const data = encodeFunctionData({
            abi: receptorMockStatusAbi,
            functionName: 'setStatus',
            args: [wallet, requestId, ELIGIBILITY_STATES.indexOf(state)],
          });
          hash = (await rpc(client, 'eth_sendTransaction', [{ from: deployer, to: deployment.verifier, data }])) as Hex;
        } finally {
          await rpc(client, 'anvil_stopImpersonatingAccount', [deployer]);
        }
        const receipt = await waitForTransactionReceipt(client, { hash });
        setStates((prev) => ({ ...prev, [wallet.toLowerCase()]: state }));
        setMessage(`${short(wallet)} is now ${state} (block ${receipt.blockNumber.toString()})`);
        notifyEligibilityChanged(wallet);
      } catch (e: unknown) {
        setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [client, connection.address, deployment.deployer.address, deployment.verifier, requestId],
  );

  // One connector per seeded wallet, created here and handed to wagmi on click, so the app's own
  // wagmi config needs no dev wiring: nothing about Anvil accounts exists outside this panel.
  const connectorFor = useMemo(() => {
    const byIndex = new Map(
      deployment.wallets.map((w) => [w.index, anvilAccountConnector({ address: w.address, index: w.index, label: `Wallet ${w.index} (${w.state})` })] as const),
    );
    return (index: number) => byIndex.get(index);
  }, [deployment.wallets]);

  if (!onLocal) return null;

  const connectedRow = connected && deployment.wallets.find((w) => w.address.toLowerCase() === connected);
  const connectedState = connected ? states[connected] : undefined;

  return (
    <section className={['rb-devstate', className].filter(Boolean).join(' ')} aria-label="Local dev state">
      <p className="rb-devstate-title">
        Dev state
        <span className="rb-devstate-muted">
          {' '}
          Anvil chain {LOCAL_CHAIN_ID}
          {deployment.forkOf ? `, fork of ${deployment.forkOf}` : ', no fork'}, request id {deployment.requestId}. Dev server only; never on
          151 or 153.
        </span>
      </p>
      <table className="rb-devstate-table">
        <thead>
          <tr>
            <th>Wallet</th>
            <th>State</th>
            <th>Address</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {deployment.wallets.map((w) => {
            const isConnected = connected === w.address.toLowerCase();
            const connector = connectorFor(w.index);
            const state = states[w.address.toLowerCase()] ?? w.state;
            return (
              <tr key={w.address} className={isConnected ? 'rb-devstate-connected' : undefined} aria-current={isConnected ? 'true' : undefined}>
                <td>
                  {w.index}
                  {isConnected ? <span className="rb-devstate-mark"> connected</span> : null}
                </td>
                <td>
                  {state} <span className="rb-devstate-muted">({STATE_HINT[state]})</span>
                </td>
                <td>
                  <code title={w.address}>{short(w.address)}</code>
                </td>
                <td>
                  {isConnected ? (
                    <button type="button" className="rb-devstate-button" onClick={() => disconnect.mutate({})}>
                      Disconnect
                    </button>
                  ) : connector ? (
                    <button type="button" className="rb-devstate-button" disabled={connect.isPending} onClick={() => connect.mutate({ connector })}>
                      Connect
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="rb-devstate-actions" role="group" aria-label="Set the connected wallet's state">
        <span className="rb-devstate-muted">
          {connection.address
            ? `Set ${connectedRow ? `wallet ${connectedRow.index}` : short(connection.address)} to:`
            : 'Connect a wallet above to change its state.'}
        </span>
        {ELIGIBILITY_STATES.map((s) => (
          <button
            key={s}
            type="button"
            className="rb-devstate-button"
            disabled={!connection.address || busy !== null || connectedState === s}
            aria-pressed={connectedState === s}
            onClick={() => void setState(s)}
          >
            {busy === s ? `${s}…` : s}
          </button>
        ))}
      </div>
      {message ? <p className="rb-devstate-muted rb-devstate-message">{message}</p> : null}
    </section>
  );
}
