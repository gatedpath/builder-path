# Business delegate

The wallet is an authorised delegate (a contractor, a developer, a service account) or an
authorised representative (a director or officeholder) of a business that a Redbelly
accredited issuer has verified as an incorporated entity. This one is different from the
other recipes: there is no zero-knowledge proof. The business's `BusinessIdentifier` contract
is public, and the check is a role read on it.

## What stands behind it

Vine's business verification pages: only directors, officeholders or parties they authorise
may apply, and they must already hold a personal Redbelly account. They give the accredited
issuer (Averer, by ticket or through the `BusinessOnboardingSdk`) a beneficial-owner
declaration, the public addresses of the initial representatives, the registered address and
incorporated name, proof of authorisation if they are not an officeholder, their own Redbelly
address and full name. The issuer verifies the business and deploys a `BusinessIdentifier`
contract, then hands the business its address.

The schema repository holds a `ProofOfIncorporationCredential` (legal name, address,
registration number, jurisdiction, legal form) and a `BeneficiariesCredential`. Neither page
ties the contract deployment to one of those credentials being issued, and
`ProofOfIncorporation` is not on the SDK's queryable list, so which credential backs the
contract is a `verify`. For this recipe it doesn't matter: the contract is the artefact.

## The check

`BusinessIdentifier` inherits OpenZeppelin's `AccessControlUpgradeable`, so `hasRole(role,
wallet)` is a public view. The two roles in the source Vine prints:

| Role | Constant | keccak256 |
|---|---|---|
| Delegate | `AUTHORISED_DELEGATE_ROLE` = `keccak256("AUTHORISED_DELEGATE")` | `0x6494d5e3707430a1857c88818398044db72cc7b27132465c5a1deeabbc7cfb96` |
| Representative | `AUTHORISED_REPRESENTATIVE_ROLE` = `keccak256("AUTHORISED_REPRESENTATIVE")` | `0x863b5b0fef9bf654e0f8d48b44c30a7481c0db52f9f6e900a859fa3097ddd633` |

Hashes computed with `cast keccak` on 12 September 2026. The contract's own modifiers rank
the issuer's admin role above representative above delegate, so a representative satisfies
a delegate check in the contract's logic. This recipe's convention for the adapter: request
id 0 accepts either role, request id 1 accepts representatives only. That mapping is ours,
not Redbelly's.

The identifier address is not discoverable from here: there is no name registry to read.
The business tells you its identifier address and you pin it, one adapter per business, the
way `VCVerifierAdapter` is one per verifier. Whether the deployed contracts match the source
Vine prints, and whether any is verified on Routescan, is a `verify`.

## How it reaches the chain

Nothing to set and nothing to prove. A representative calls `addAuthorisedDelegate([wallet])`
on the identifier (Vine's steps go through Routescan's write tab with the representative's
connected wallet). The contract grants the role and, through
`IBusinessPermission.requestBusinessPermissionForUser`, gives the wallet network write access
as a sub-account of the business, no KYC of its own. `removeAuthorisedDelegate` takes both
away in one transaction.

`Gated(verifier, 0)` with `verifier = BusinessDelegateAdapter(identifier)`, where the adapter
implements `IRedbellyVerifier` as `isEligible(wallet, 0) = hasRole(DELEGATE) ||
hasRole(REPRESENTATIVE)` and `isEligible(wallet, 1) = hasRole(REPRESENTATIVE)`. That adapter
is not written yet; `receptor-mock` ships adapters for Iden3 and VC verifiers only. Unlike an
Iden3 proof the read is live: the moment a delegate is removed the gate reverts, so there is
no stickiness and no freshness window to design. And since removal also withdraws the
wallet's network permission, a removed delegate cannot even attempt the call; the gate is
the second line.

## The five states

| State | On the real identifier | In tests |
|---|---|---|
| NeverIssued | Neither role on this identifier (including a wallet whose role is on some other business's contract) | the mock's default |
| Valid | `hasRole` true for delegate or representative | `setStatus(wallet, 0, Valid)`; on a fork, a representative calling `addAuthorisedDelegate` |
| Expired | Unreachable: roles carry no time field in the source. Keep the mock test so the gate is proven to reject it if expiry ever appears | `setValidUntil` then `vm.warp` |
| Revoked | `removeAuthorisedDelegate` or `removeAuthorisedRepresentative` ran; false at once, network permission withdrawn in the same call | `setStatus(wallet, 0, Revoked)`; on a fork, the remove call |
| WrongJurisdiction | A role on another business's identifier, or only the delegate role where the gate wants a representative (request 1) | `setStatus(wallet, 1, WrongJurisdiction)` |

## Privacy

Leaves the wallet at check time: nothing; the gate is a view your contract makes. Lands on
chain: everything about the business, in public storage, which is the contract's purpose as
Vine states it: company name, incorporated name, identifier type and number, business
address, the beneficial-owner flag, the official contracts; and every role grant and removal
as a `RoleUpdated` event, so the set of delegates and representatives is public history and
a delegate wallet's link to the business stays in the log after removal. Never on chain: the
delegate's own identity (a sub-account needs no KYC) and the KYB documents Averer saw.

The consequence, with `RESEARCH.md` question 20 in mind: business wallets are the one case
where wallets are publicly linkable by design. Use delegate wallets for service accounts and
deployments where that link is wanted. Don't make a person's personal, KYC-linked wallet a
delegate unless they accept that the link is public.

## Status

Draft, five `verify` markers. The adapter is unwritten; the read itself is a documented
public getter on a documented contract. Open questions 20 and 25 in `RESEARCH.md`.
