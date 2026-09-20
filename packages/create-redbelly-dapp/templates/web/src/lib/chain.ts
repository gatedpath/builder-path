// Chain selection for the web app. Chain objects and every address come from
// @gatedpath/chains; nothing here is typed by hand. The one addition is the local Anvil that
// `npm run dev` starts (chain 31337): it exists only in the dev server, when next.config.ts has
// inlined deployments/local.json, and it borrows the forked network's permission address so
// `isAllowed` reads the gate that `npm run dev` seeded for the five wallets.
import { chainById, redbellyTestnet } from "@gatedpath/chains";
import type { Chain } from "viem";

const LOCAL_CHAIN_ID = 31337;
const requested = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? redbellyTestnet.id);
const localJson = process.env.NEXT_PUBLIC_LOCAL_DEPLOYMENT;
const local = requested === LOCAL_CHAIN_ID && localJson ? (JSON.parse(localJson) as { forkOf: 151 | 153 | null }) : null;
const upstream = chainById(local ? (local.forkOf ?? redbellyTestnet.id) : requested);
if (!upstream) {
  throw new Error(`NEXT_PUBLIC_CHAIN_ID=${requested} is not a Redbelly chain (151 or 153)`);
}

/** True in the dev server against `npm run dev`'s Anvil; never in a production build. */
export const isLocal = local !== null;

/** The chain the app talks to. viem's Chain type is satisfied by the package's objects. */
export const chain: Chain = local
  ? {
      id: LOCAL_CHAIN_ID,
      name: `Local Anvil${local.forkOf ? ` (fork of ${local.forkOf})` : ""}`,
      nativeCurrency: upstream.nativeCurrency,
      rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"] } },
      testnet: true,
    }
  : (upstream as unknown as Chain);

/** The network permission gate: permission.isAllowed(address). On the local chain, the forked network's address. */
export const permissionAddress = upstream.contracts.permission.address;

export const ACCESS_URL = "https://access.redbelly.network";
export const FAUCET_URL = "https://redbelly.faucetme.pro/";

export const permissionAbi = [
  {
    type: "function",
    name: "isAllowed",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
