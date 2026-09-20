# web/

Next.js (app router) with wagmi and viem. Chain objects and every address come from
`@gatedpath/chains` (vendored at `../vendor/redbelly-chains`), so no chain id or
RPC is typed in this folder.

```
__PM_INSTALL__
cp ../.env.example .env      # then set NEXT_PUBLIC_CONTRACT_ADDRESS after your first deploy
__PM_RUN__ dev
```

What is here:

- `src/lib/wagmi.ts`: the wagmi config. WalletConnect (Vine's recommendation for dApps on
  Redbelly) is enabled when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set; an injected
  connector is always there. Fee fields are left unset so the client estimates.
- `src/components/useIsAllowed.ts` and `VerifyWallet.tsx`: read `permission.isAllowed` for
  the connected wallet, show the "verify your wallet" interstitial with a link to
  https://access.redbelly.network while it is false, and poll until it turns true.
- `src/components/GatedAction.tsx` and `src/contract.ts`: one gated action on the template
  contract, with the ABI copied from `contracts/out` by `__PM_RUN__ abi:sync` at the root.
- `src/components/GasNote.tsx`: prices a transfer in USD from the on-chain feed, because
  Vine warns that many wallets mishandle gas information on this network.
- `src/app/eligibility/page.tsx`: the same wallet through `@gatedpath/frontend-kit`
  (vendored at `../vendor/redbelly-frontend-kit`): `useEligibility` on the template contract's
  verifier and request id, `EligibilityGate` for the five states, `LastChecked` and `GasWarning`.
- `src/eligibility/`: the optional Eligibility SDK integration point, with the exact steps
  and no key.
