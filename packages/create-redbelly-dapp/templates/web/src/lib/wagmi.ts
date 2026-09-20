// wagmi config. WalletConnect is Vine's recommendation for dApps on Redbelly; injected
// wallets are kept as a fallback for local development. Vine also warns that most wallets
// mishandle gas information on this network, which is why the UI shows the USD cost itself
// (see components/GasNote.tsx) rather than trusting the wallet's estimate display.
import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { chain } from "./chain";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const config = createConfig({
  chains: [chain],
  connectors: [
    injected(),
    // Only when a Reown project id is configured; the app builds and runs without it.
    ...(projectId
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: {
              name: "__PROJECT_NAME__",
              description: "Identity-gated dApp on Redbelly Network",
              url: typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: {
    // Fee fields stay unset on purpose: the client estimates. Never hardcode a gas price here.
    [chain.id]: http(chain.rpcUrls.default.http[0]),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
