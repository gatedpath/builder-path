# GatedERC20

One page on the token itself. The other modules have their own pages: `issuer-registry.md`,
`compliance.md`, `pause.md`, `admin-pattern.md`, and `erc-3643.md` for when not to use this at all.

## What it is

An ERC-20 on OpenZeppelin 5.6.1 (`ERC20`, `ERC20Pausable`, `AccessControl`) and the `Gated` base
from `@gatedpath/receptor-mock`, compiled with solc 0.8.30 for EVM Prague, the pins Vine
states for both Redbelly networks. Every holder must be eligible under the dApp's own Receptor
verifier, presented through `IRedbellyVerifier` (an `Iden3VerifierAdapter` or `VCVerifierAdapter`
in production, `ReceptorMock` in tests and on forks; the mock refuses to deploy on chain 151).

## The rule

Both real parties of every movement must be eligible. `_update` runs `_requireEligible` on
`from` when it is not a mint and on `to` when it is not a burn; that is the function `Gated.gatedFor`
wraps, and `mint` and `forceTransfer` carry `gatedFor(to)` on their signatures as well so the rule
shows in the ABI. A spender in `transferFrom` is never checked; only the wallet losing tokens and
the wallet gaining them. The check is one `view` call per party to the verifier.

The exception is `forceTransfer`, which skips the check on `from` (the wallet being emptied is
usually the one whose credential lapsed) but still requires `to` to be eligible.

## Functions

| Function | Who | Gate | Pause |
|---|---|---|---|
| `subscribe()` | any wallet, once, while open | caller eligible | blocked |
| `transfer`, `transferFrom` | holders and their spenders | from and to eligible | blocked |
| `burn(amount)` | holder | holder eligible | blocked |
| `mint(to, amount)` | an active issuer | to eligible; issuer window and allowance | blocked |
| `distribute(to[], amounts[])` | an active issuer | eligible recipients paid, others skipped and logged | blocked |
| `forceTransfer(from, to, amount, hash)` | `COMPLIANCE_ROLE` | to eligible; hash non-zero | blocked |
| `pause()` | `PAUSER_ROLE` | | |
| `unpause()`, `setSubscriptionsOpen`, `setVerifier`, `setRequestId`, role grants | `DEFAULT_ADMIN_ROLE` | | |
| `setIssuer`, `revokeIssuer` | `ISSUER_ADMIN_ROLE` | | |
| `canSubscribe`, `canTransfer`, `canIssue`, `isEligible` | anyone, view | | |

The `can*` views exist so a UI can explain a button before the wallet signs. They mirror the gate;
they are not the gate. The frontend kit's `useEligibility` reads `isEligible` and the network's
`permission.isAllowed`, which is the other half of what a Redbelly UI has to say.

## Revocation policy

A holder whose credential lapses (expired, revoked, no longer satisfying the query) keeps the
balance and can do nothing with it: no send, no receive, no burn. The compliance officer moves it
with `forceTransfer` to a custody or treasury wallet that is eligible. This is a policy choice,
not a technical necessity, and the alternatives (freeze forever, auto-transfer to custody, let the
holder exit by burning) each have a regulator's question attached. Write yours in `THREAT-MODEL.md`
before the first testnet deploy; the scaffolder puts the heading there.

What the tests can and cannot say about it: `GatedERC20NoDowngradeInvariants` proves that when
credentials never lapse after a wallet holds tokens, no ineligible wallet ever holds tokens.
`GatedERC20Invariants` lets credentials lapse and proves the strongest thing that stays true:
nobody ever receives tokens while ineligible, by any of the six paths that can move a balance.

## Redbelly specifics baked in

Transient storage (`bool private transient _forcing`) for the forced-transfer flag, because Prague
has it and it costs nothing to leave behind. No reorg handling: a transaction that is in a block
is final. No priority fee logic anywhere: gas is fixed in USD by the network's price feed and the
client's estimate is the right number (RESEARCH.md question 6). And the non-reverting denial path
in `distribute`, because the governors RPC serves no trace methods, so a reverted transaction's
custom error cannot be recovered after the fact; an event can.

## What is deliberately not here

No `permit` (EIP-2612). It would be signed with the chain id, which is right, but it also lets a
spender move tokens with a signature the holder produced off-chain, and a permissioned asset
usually wants every movement to be a transaction the holder's verified wallet sent. Add
`ERC20Permit` yourself if your asset wants it; the gate still runs in `_update`.

No partial freezing, no address freezing beyond what a lapsed credential does, no recovery of a
lost wallet, no on-chain identity registry of its own. Those are the things ERC-3643 has and this
kit does not; `erc-3643.md` says when that matters.

No upgradeability. If the rules change, deploy a new token and migrate with `forceTransfer` under
a written justification, or put a proxy in front of it yourself and accept the audit surface that
comes with it.

## Tests

`test/GatedERC20.t.sol` runs every gated function through the five credential states with
`GatedTest` (21 tests), `GatedERC20.fuzz.t.sol` fuzzes transfers, subscriptions, forced transfers
and distributions at 512 runs (4), `GatedERC20.invariants.t.sol` runs two invariant suites at 64
runs of depth 32 (12), `IssuerRegistry.t.sol` covers the registry (7, one fuzzed) and
`AdminPattern.t.sol` the timelock wiring (7). Fifty-one in all, plus Slither and Aderyn under
`reports/` and the gas snapshot in `.gas-snapshot`.
