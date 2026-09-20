"use client";

import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { chain } from "@/lib/chain";

export function Connect() {
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="card">
        <p>
          Connected: <code>{address}</code>
        </p>
        {chainId !== chain.id && (
          <p className="muted">
            Your wallet is on chain {chainId}; this app targets {chain.name} ({chain.id}). Nothing is sent until they match; each action below offers the switch.
          </p>
        )}
        <button onClick={() => disconnect.mutate({})}>Disconnect</button>
      </div>
    );
  }

  return (
    <div className="card">
      <p>Connect a wallet. WalletConnect is the recommended route on Redbelly; an injected wallet also works.</p>
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          className="primary"
          style={{ marginRight: 8 }}
          disabled={connect.isPending}
          onClick={() => connect.mutate({ connector })}
        >
          {connector.name}
        </button>
      ))}
      {!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID && (
        <p className="muted">
          WalletConnect is off until NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set in .env (a public project id from cloud.reown.com).
        </p>
      )}
      {connect.error && <p className="muted">{connect.error.message}</p>}
    </div>
  );
}
