import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// `npm run dev` at the project root writes deployments/local.json (Anvil chain 31337, the mock
// verifier, the contract, five seeded wallets; never a key). The dev server inlines it as
// NEXT_PUBLIC_LOCAL_DEPLOYMENT so the app can target the local chain and show the dev state
// panel. Any other phase, `next build` included, inlines an empty string: the panel's branch is
// dead code there and the bundler drops it, and chain 31337 is refused like any other unknown id.
export default function config(phase: string): NextConfig {
  const localFile = resolve(process.cwd(), "..", "deployments", "local.json");
  const local = phase === PHASE_DEVELOPMENT_SERVER && existsSync(localFile) ? JSON.parse(readFileSync(localFile, "utf8")) : null;
  const env: Record<string, string> = { NEXT_PUBLIC_LOCAL_DEPLOYMENT: local ? JSON.stringify(local) : "" };
  if (local && !process.env.NEXT_PUBLIC_CHAIN_ID) {
    // `npm run web:dev` on its own, after `npm run dev --no-web`: target the local chain by default.
    env.NEXT_PUBLIC_CHAIN_ID = String(local.chainId);
    env.NEXT_PUBLIC_CONTRACT_ADDRESS = String(local.contract);
  }
  return {
    reactStrictMode: true,
    env,
    // The vendored @gatedpath/chains package lives in ../vendor, outside this app.
    // Turbopack resolves only inside its root, so the root is the monorepo.
    turbopack: {
      root: resolve(process.cwd(), ".."),
    },
  };
}
