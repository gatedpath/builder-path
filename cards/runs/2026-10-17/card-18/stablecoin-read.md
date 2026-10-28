# The AUD stablecoins on Redbelly mainnet: who may send them, read 17 October 2026

Read-only, before any code. `cast call` against https://governors.mainnet.redbelly.network at block
3,228,539 (17:20 BST) and again at 3,228,695 (22:39 BST), the verified sources from Routescan's
Etherscan-style API, and a transfer probe on a local Anvil fork of mainnet at block 3,228,694 (chain
31337 on 127.0.0.1:8558). Nothing was signed on 151. Addresses are the census's of 12 October 2026.

| Coin | Address | Decimals | Supply | Shape | Source |
|---|---|---|---|---|---|
| AUDD | 0x54a210e824B0F89dA988E4B5586440aB354f0e46 | 6 | 50,251.00 | ERC-1967 proxy (`AdminUpgradeabilityProxy`, verified) to implementation 0xe28f29A76ee1f0fDC438EA6176ee8996B1fd1A4f | implementation NOT verified on Routescan |
| AUDM (Macropod Stablecoin) | 0x081599E4936D12c46Bd48913B2329115Cd26cbdd | 18 | 51,012.00 | UUPS proxy (verified) to `ERC20FGasless` 0xeBAdAf3d0Ee4bBaA94717bD9029244b1Df2f47AA, Fireblocks' ERC20F with an access registry | verified |
| rAUD ("Australian Dollar") | 0xf950b1beA7AB1688e1EAA96c0Ff0ccBAB087BB54 | 6 | 1,000,000,000.00 | plain OpenZeppelin 5.6.0 `ERC20` + `Ownable` with owner-only `mint` and `burn` (`contract Stablecoin`) | verified |
| rAUD (second contract) | 0x3347618acc92226B2eFA6eb8c35e5cc3d56eAB1f | 6 | 10,000,000.00 | same name and symbol, different bytecode | NOT verified |

## What gates whom

**AUDM** is the only one of the three with a gate. `transfer` and `transferFrom` in ERC20F call
`_requireHasAccess(from, true)` and `_requireHasAccess(to, false)`; each asks
`accessRegistry.hasAccess(account, _msgSender(), _msgData())` when an access registry is set. On
mainnet one is set: 0xe97323c3AE72c67a739b3E640fBFfd83C7De0585, a UUPS proxy whose verified
implementation (0x0D7D2f28AB186CD706878c9943221B001bcFC3D7) is Fireblocks' `DenyList`:
`hasAccess` returns `!_accessList.contains(account)`. A live call with an address on no list
(0x1111...1111) answered `true`. So AUDM refuses senders and recipients that its administrator has put
on a deny list, and nobody else. The check is on `from` and `to`, never on the caller: a contract
spending an approved allowance is not examined at all. The coin is also pausable (`paused()` false)
and `RECOVERY_ROLE` can pull tokens from a denied address.

**AUDD** cannot be read from source. Its implementation's dispatcher carries 33 selectors (extracted
from the bytecode and looked up with `cast 4byte`): the ERC-20 set with `increaseAllowance` and
`decreaseAllowance`, `paused()`, `owner()`, `initialize(string,string,uint8,address,address)`,
`swap(address,uint256)`, and a request-and-vote control layer (`createTokenSupplyControlRequest`,
`createThresholdControlRequest`, `createSignatoryControlRequest`, `createTransactionControlRequest`,
`vote`, `execute`, `cancelRequest`, `getSignatoryList`, and their getters and updaters). No
`isBlacklisted`, `blacklist`, `freeze`, `isFrozen`, `whitelist`, `allowlist`, `hasAccess`,
`accessRegistry`, `blacklister`, `pauser`, `masterMinter`, `assetProtectionRole`,
`supplyController`, `permit` or `transferWithAuthorization`; every one of those is absent and every
live call to them reverts. "Transaction control request" could hide a per-transfer rule, so the
behaviour was probed rather than assumed (below).

**rAUD** (the verified one) has no gate of any kind: OpenZeppelin's `ERC20` untouched except for six
decimals, with `mint` and `burn` for the owner.

## May a contract send them? Yes, all three, on the real chain and on the fork

On mainnet itself, Routescan's transfer list for AUDD shows 0x73654a261fb3d07f56b6285595e3259eff026045,
a contract of 1,779 bytes (the census names it "Aave interest bearing AUDD"), sending AUDD at blocks
3,208,232, 3,116,114 and others; for AUDM, 0x5aedfe9e6f800eb48e3dcb758bd0575b4bdd5b2e ("Aave
interest bearing AUDM", also a contract) sends AUDM at blocks 3,116,064, 3,047,956 and others.
Contracts already send both coins on the real network.

On the fork (`stablecoin-probe-output.txt`), a throwaway `Forwarder` contract deployed from Anvil
account 2, with a real holder (0xd0eb9c0a33588eeacf4350375e62ad068380ee60 for AUDD and AUDM, the
owner 0xc9129Bea5F66A7E14A9016414f97fC728FA85D29 for rAUD) impersonated locally:

1. holder to the Forwarder (a contract as recipient): status 1 for all three;
2. Forwarder.transfer to Anvil account 3 (a contract as sender): status 1 for all three (61,056 gas
   AUDD, 79,732 AUDM, 51,999 rAUD);
3. holder approves the Forwarder, Forwarder.transferFrom to account 3 (a contract as spender, the
   path the distributor uses): status 1 for all three;
4. account 3, a fresh wallet on no list, sends 1 unit to account 2: status 1 for all three.

## What it means for the card

The distributor may be a contract and may use `transferFrom` from the administrator's wallet. The
"pay from the wallet one transfer at a time" fallback is not needed for any of the three coins as
they stand today, and the interface need not say it; the test suite keeps the case anyway
(`test_coinThatRefusesContractSpendersFailsEveryPaymentAndKeepsTheMoney`) because AUDD's
implementation is unverified and upgradeable, and AUDM's deny list can hold any address, including a
holder's or the distributor's. A denied holder is a payment that fails part way, which the contract
records and lets the administrator retry.

Two cautions for a real distribution. AUDD is behind an admin proxy with an unverified
implementation: what it does tomorrow is what its owner (0xeC08B8B78035C21b67d5d9E9AA19173E3e44041b)
decides, and no source says what the "transaction control requests" are for. AUDM's recipients can
be denied: a holder on the deny list cannot be paid in AUDM at all, by anyone, and the receipt log
should say so rather than the administrator sending the money somewhere else.

A small thing seen on the way: two of the busiest AUDD and AUDM wallets
(0x50fd2dfe2b5c9527bf96f403829a0cc15faeb6ba, 0xd0eb9c0a33588eeacf4350375e62ad068380ee60) carry 23
bytes of code, the shape of an EIP-7702 delegation. Prague is live on this chain and someone is
using it.
