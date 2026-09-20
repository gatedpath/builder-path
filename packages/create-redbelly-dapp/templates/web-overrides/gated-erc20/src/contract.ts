// The template contract the gated action calls. The ABI is copied from contracts/out by
// `abi:sync` at the root; don't edit it by hand. The address comes from .env after a deploy.
import abi from "./abi/GatedERC20.json";

const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

export const contract = {
  name: "GatedERC20",
  address: address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : undefined,
  abi: abi as typeof abi,
  actionFunction: "subscribe" as const,
  canFunction: "canSubscribe" as const,
  actionLabel: "Subscribe",
  description: "Mints the subscription amount to your wallet, once, while subscriptions are open. The contract checks your credential on-chain.",
  ineligibleHint:
    "You can't subscribe right now: either your credential doesn't satisfy this token's rule, subscriptions are closed or paused, or this wallet already subscribed.",
};
