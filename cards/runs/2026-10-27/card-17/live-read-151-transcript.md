# Card 17, the register explorer: the live read of mainnet, 27 October 2026

Production build (`NEXT_PUBLIC_CHAIN_ID=151 npm run build`, 8 s), served with `npm run start -- --port 3151`,
opened at `http://localhost:3151/registers` in a browser at 20:47:39 UTC with no wallet connected. Nothing was
signed and nothing was sent; the page's only traffic is `eth_call` reads of `https://governors.mainnet.redbelly.network`,
batched through Multicall3 by the kit's `useRegister`. Browser console: no errors, no warnings.

## What the page said

- Heading: **44 of 44 candidates answer as registers**, every one read at **block 3,241,235**.
- Gate kind: **38 registration only**, **6 claims**.
- Pause state: **26 paused**, **18 not paused**.
- Trusted issuers: 38 registers trust none and require no claim topics. The six claims-gated registers:
  - Remara Credit Income Fund (RCIF) `0x1Cbf18Ac…f063` and `0x56E1f44B…f809`, both on identity registry
    `0xA15397E9…27f7` (shared), issuer `0x6B485E05…4B11` for topics 1, 2, 3, 4, 5; required 1, 2, 3, 4, 5.
  - Gotham Capital Fund (GCF) `0x8895c30C…A000`, issuer `0x6B485E05…4B11` for topics 1 to 5; required 1 to 5.
  - Property Income Fund (NPIF) `0xBAFb145E…0d63`, issuer `0x6B485E05…4B11` for topics 1, 2, 3; required 1, 2, 3. Paused.
  - RBC - Income - 36 Months - BX (RBCBXM1) `0xA8351e43…10A5` and FCBN Note (RBC TSLA) `0xa1072115…9d9F`, two
    registries sharing one identity storage `0x973B945f…86B8`, issuer `0x06f3BB3b…85c5` for topic 13; required 13.
- The largest by supply: CLASS A `0x0Eea5afF…e392`, 75,531,283.012 units, 18 decimals, paused, registration only
  (the register card 18 rebuilt the holder table of on 17 October).

The full row for each register (name, symbol, address, supply with decimals, T-REX version 4.1.3 on all 44, pause
state, gate kind, identity registry and its storage, trusted issuers with their topics, required topics, block) is
what the page renders; `registers-page.tsx` beside this file is the page as run and `registers.ts` the candidate list.

## The wallet track, cross-checked from the command line

No wallet extension exists in the browser the session used, so the connected-wallet column (the register gate in
the kit's words, verified, country code, frozen, balance) was not exercised in the page. The same reads were made
once through the ops kit's reader from the public registry, read-only, for one claims-gated register and the owner's
development wallet:

```
npx -y -p @gatedpath/ops-kit@0.2.3 redbelly-register 0x1Cbf18Ac9c8A6ac79524a7833C2415456e98f063 \
  --wallet 0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59 --rpc https://governors.mainnet.redbelly.network
```

> Remara Credit Income Fund (RCIF), an ERC-3643 register, T-REX 4.1.3 … gate: claims. A wallet is verified when its
> identity holds claims for topics 1, 2, 3, 4, 5 from a trusted issuer.
> wallet 0x38d8…6B59: not verified for this register; not registered; balance 0 base units

That is the answer the page's row would carry for that wallet: state `not-registered`, not verified, no identity
registered (so no country code is read), balance 0.
