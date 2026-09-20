import { createConnector } from 'wagmi';
import { getAddress, numberToHex, type EIP1193RequestFn } from 'viem';
import type { Address } from '../useEligibility.js';
import type { LocalDeployment } from './localDeployment.js';

export interface AnvilAccountConnectorOptions {
  /** The Anvil account to act as. Must be one the node has unlocked (its own ten, or an impersonated one). */
  address: Address;
  /** The account's index, for the connector's name. */
  index: number;
  /** A label for the button; defaults to `Wallet <index>`. */
  label?: string;
}

/**
 * A wagmi connector for one of Anvil's unlocked accounts. Every request goes straight to the
 * chain's RPC: `eth_sendTransaction` is signed by the node, so the browser never holds a key
 * and nothing is imported into a wallet extension. It only makes sense against a local Anvil
 * (chain 31337); `npm run dev` in a scaffold adds one per seeded wallet in the dev server and
 * none in a production build.
 */
export function anvilAccountConnector({ address, index, label }: AnvilAccountConnectorOptions) {
  const account = getAddress(address);
  let connected = false;
  type Provider = { request: EIP1193RequestFn };
  return createConnector<Provider>((config) => ({
    id: `anvil-account-${index}`,
    name: label ?? `Wallet ${index}`,
    type: 'anvilAccount',
    async connect() {
      connected = true;
      // wagmi types the accounts by a `withCapabilities` generic; this connector has no capabilities to report.
      return { accounts: [account] as readonly Address[], chainId: await this.getChainId() } as never;
    },
    async disconnect() {
      connected = false;
    },
    async getAccounts() {
      return connected ? [account] : [];
    },
    async getChainId() {
      const chain = config.chains[0];
      if (!chain) throw new Error('no chain configured');
      return chain.id;
    },
    async isAuthorized() {
      return connected;
    },
    async switchChain({ chainId }) {
      const chain = config.chains.find((c) => c.id === chainId);
      if (!chain) throw new Error(`chain ${chainId} is not configured`);
      return chain;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      connected = false;
      config.emitter.emit('disconnect');
    },
    async getProvider() {
      const chain = config.chains[0];
      if (!chain) throw new Error('no chain configured');
      const url = chain.rpcUrls.default.http[0];
      if (!url) throw new Error('the chain has no HTTP RPC URL');
      const request = (async ({ method, params }: { method: string; params?: unknown }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
        if (method === 'eth_chainId') return numberToHex(chain.id);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }),
        });
        const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
        if (body.error) throw new Error(body.error.message ?? 'RPC error');
        return body.result;
      }) as EIP1193RequestFn;
      return { request };
    },
  }));
}

/** One connector per seeded wallet, in the file's order (NeverIssued first, Valid second). */
export function anvilAccountConnectors(deployment: LocalDeployment) {
  return deployment.wallets.map((w) => anvilAccountConnector({ address: w.address, index: w.index, label: `Wallet ${w.index} (${w.state})` }));
}
