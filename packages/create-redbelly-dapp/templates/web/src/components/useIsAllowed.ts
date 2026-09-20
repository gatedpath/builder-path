"use client";

import { useReadContract } from "wagmi";
import { permissionAbi, permissionAddress } from "@/lib/chain";

/**
 * permission.isAllowed(address) on the network's gate. False means the wallet has not been
 * verified at access.redbelly.network and cannot send anything. Polled every few seconds
 * while false so the interstitial clears by itself once verification lands.
 */
export function useIsAllowed(address: `0x${string}` | undefined) {
  return useReadContract({
    address: permissionAddress,
    abi: permissionAbi,
    functionName: "isAllowed",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: (query) => (query.state.data === false ? 5_000 : false),
    },
  });
}
