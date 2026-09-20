// The template contract the gated action calls. The ABI is copied from contracts/out by
// `abi:sync` at the root; don't edit it by hand. The address comes from .env after a deploy.
import abi from "./abi/GatedExample.json";

const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

export const contract = {
  name: "GatedExample",
  address: address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : undefined,
  abi: abi as typeof abi,
  actionFunction: "ping" as const,
  canFunction: "canPing" as const,
  actionLabel: "Ping",
  description: "Calls the one gated function. The contract checks your credential on-chain and counts the call.",
  ineligibleHint: "You can't ping right now: your credential doesn't satisfy this contract's rule.",
};
