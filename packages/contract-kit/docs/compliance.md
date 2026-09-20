# Compliance role and forced transfers

`COMPLIANCE_ROLE` may move tokens out of any wallet. Nothing else about the role is special: it
cannot mint, pause, unpause or change the verifier.

## The function

```solidity
function forceTransfer(address from, address to, uint256 amount, bytes32 justificationHash) external;
event ForcedTransfer(address indexed from, address indexed to, uint256 amount, bytes32 indexed justificationHash, address officer);
```

Rules, in the order they are checked: the caller holds `COMPLIANCE_ROLE`; `to` is eligible (the
`gatedFor(to)` modifier); the hash is not zero; the token is not paused; `from` has the balance.
`from` is not checked for eligibility, because the wallet being emptied is usually the one whose
credential has lapsed. The transfer goes through `_update` with a transient flag set so the gate
skips `from` for that one call and only that one call; `test_forceTransfer_doesNotLeakTheForcingFlag`
proves the next plain transfer from the same wallet in the same block is refused again.

## What the hash is

`keccak256` of the document that authorised the move: a court order, a regulator's direction, an
internal incident ticket, a signed instruction from the holder who lost their wallet. The document
stays off-chain with the compliance team; the hash is on the log, indexed, forever. When an auditor
or a regulator asks why wallet A was emptied on date B, the answer is the document whose hash
matches. That is why the hash is required and why the zero hash is refused: a forced transfer with
no reason attached is the thing a monitor should never see.

Compute it with the same bytes you archive:

```
cast keccak "$(cat court-order-2026-09-12.pdf | base64)"   # or hash the file bytes directly
cast keccak-file court-order-2026-09-12.pdf                # hashes the raw file
```

Pick one convention (raw file bytes is the sensible one) and write it in the runbook so two people
compute the same hash from the same document a year apart.

## Who should hold the role

A Safe with a threshold of at least two, held by the people who sign compliance instructions in the
real world. Not the timelock: a court order does not wait two days. Not an EOA on mainnet: the
pre-flight CLI and the deploy script both refuse an EOA admin, and the same reasoning applies here
even though the code does not enforce it for operational roles. The admin pattern page has the
whole layout.

## What the invariant suite holds it to

`invariant_forcedTransfersCarryAHash`: every forced transfer that succeeded emitted a
`ForcedTransfer` with a non-zero hash. `invariant_noIneligibleRecipient`: a forced transfer never
lands in an ineligible wallet. `invariant_noTransferWhilePaused`: a forced transfer never lands
while paused. The fuzz test `testFuzz_forceTransfer_needsHashAndEligibleRecipient` walks the
sender through all five credential states and confirms the sender's state never matters.

## Monitoring

`ForcedTransfer` is one of the four events the operations kit's alert script watches (with
`Paused`/`Unpaused`, `RoleGranted`/`RoleRevoked` and `VerifierChanged`/`RequestIdChanged`). A forced
transfer that nobody on the compliance team can match to a ticket within the hour is an incident;
the runbook in the ops kit has the steps.
