// The contract the gated action calls: the card 7 ticket. The ABI is copied from contracts/out
// by `abi:sync` at the root; don't edit it by hand. The address comes from .env after a deploy.
import type { Abi } from "viem";
import abi from "./abi/GatedTicket.json";

const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

export const contract = {
  name: "GatedTicket",
  address: address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : undefined,
  // The JSON import is typed loosely (`type: string`); viem's hooks want the `Abi` shape.
  abi: abi as unknown as Abi,
  actionFunction: "purchase" as const,
  canFunction: "canPurchase" as const,
  /** `purchase` is payable at an exact price; the page reads it from this view and sends exactly that. */
  valueFunction: "faceValue" as const,
  actionLabel: "Buy a ticket",
  description:
    "Mints one ticket to your wallet at face value. The contract checks your over-18 credential on-chain; it never sees a birth date.",
  ineligibleHint:
    "You can't buy right now: either your credential doesn't satisfy the over-18 rule, the sale is closed, or the tickets are sold out.",
};
