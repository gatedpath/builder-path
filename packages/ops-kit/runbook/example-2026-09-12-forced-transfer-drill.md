# Incident record: forced-transfer drill, 12 September 2026

A rehearsal, not a real incident, and not on a real network. It ran on a local anvil with the
contract kit's `GatedERC20` and `ReceptorMock`, exactly the setup `test/alert.test.mjs`
builds, so the block numbers below are anvil's. Nothing here touched chain 151 or 153; nothing
of ours is deployed there yet. The point of recording it is to show what a filled-in record
looks like and how long each step took with one person and no Safe latency.

## Summary

At 13:31 UTC the alert poller posted a `ForcedTransfer` of 50 GTOK from wallet A to wallet B with
justification hash `0xabab…abab` and officer C. Nobody on the drill could match the hash to a
document within ten minutes (there was none; that was the drill). The token was paused at block
21, the compliance role was revoked from C through the timelock path (simulated as a direct
revoke, since the drill token had every role on one address), holders were "told" by writing the
paragraph below, and the token was unpaused at block 25. Total time from alert to pause: about
90 seconds; alert to unpause: 11 minutes, most of it writing.

## Timeline (UTC)

| Time | Step | Evidence |
|---|---|---|
| 13:31:05 | Poller posts `ForcedTransfer` (severity critical) with the Routescan link | alert JSON: `{"event":"ForcedTransfer","args":{"from":"0x7099…","to":"0x3c44…","amount":"50000000000000000000","justificationHash":"0xabab…","officer":"0xf39f…"}}` |
| 13:31:10 | Step 1, confirm: opened the transaction; officer is our compliance address; no ticket, no timelock operation, no Safe transaction matches | `cast tx <hash>`; timelock had no pending operations |
| 13:32:30 | Step 2, stop: `pause()` sent from the pauser; `paused()` true at block 21 | `Paused` alert posted at 13:32:32 |
| 13:34:00 | Step 3, contain: `revokeRole(COMPLIANCE_ROLE, C)`; in production this is a scheduled timelock operation and the token stays paused for the delay | `RoleRevoked` alert posted |
| 13:35:00 | Step 4, tell: paragraph drafted (below) | |
| 13:41:00 | Step 5, recover: `unpause()` at block 25; `isEligible` read on wallet B (true) and on a wallet with no credential (false) | `Unpaused` alert posted |
| 13:42:00 | Record written | this file |

## What was said to holders (draft used in the drill)

"At 13:31 UTC our monitoring flagged a token movement by the compliance function that we could
not immediately reconcile with an instruction. As a precaution we paused the token at 13:32 (block
21); balances are unchanged and no further movements are possible until we unpause. We are
confirming the instruction with the compliance officer and will update at 14:00 UTC."

## What the drill found

- The hash-to-document step has no owner. Compliance knows the convention (keccak256 of the raw
  file bytes) but nobody on call has access to the document archive at night. Action: give the
  on-call read access to the archive, or have compliance post the hash and ticket number to the
  alert channel before every forced transfer so the match is a channel search.
- The poller's alert carried everything needed to act; nobody had to open a block explorer to
  find the officer or the amount.
- The timelock path was simulated. On the real deployment the revoke waits two days and the
  token stays paused; the holder message must say that.
- Time to pause, 90 seconds, was with one person and an unlocked anvil account. With a 2-of-3
  Safe and two signers asleep it will be longer; the quarterly drill should measure that number,
  not this one.

## Not real

Everything above is a rehearsal on a local chain. The addresses are anvil's unlocked accounts,
which must never be used on Redbelly (RESEARCH.md question 30); they appear here only in
shortened form and only because the test used them.
