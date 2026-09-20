# Incident runbook for a gated ERC-20 on Redbelly

For the on-call person at three in the morning. Everything here assumes the contract kit's
`GatedERC20` deployed with the Safe plus timelock pattern (`packages/contract-kit/docs/admin-pattern.md`)
and the alert poller (`scripts/alert.mjs`) posting to a channel people watch. Fill in the table
at the end once and keep it current; a runbook with blanks in it is a runbook nobody has run.

## What an alert means

| Event | Severity | Is it an incident? |
|---|---|---|
| `ForcedTransfer` | critical | Yes unless compliance can match the justification hash to a document within the hour |
| `Paused` | critical | Yes unless you did it. If you did, this runbook is already open |
| `Unpaused` | critical | Yes unless it executed from the timelock operation you scheduled |
| `RoleGranted`, `RoleRevoked`, `RoleAdminChanged` | critical | Yes unless it executed from a timelock operation you scheduled |
| `VerifierChanged`, `RequestIdChanged` | critical | Yes unless scheduled. A verifier you don't recognise means every holder is now judged by a contract you don't control |
| `IssuerPermissionSet`, `IssuerPermissionRevoked` | warning | Check the issuer, window and allowance against the tranche plan; an unplanned one is an incident |
| `EligibilityDenied` | info | A distribution skipped someone; tell the issuer, not the on-call |
| From `redbelly-system-watch`: `RegistryEntryChanged`, `ImplementationChanged`, `Upgraded`, `ProxyAdminChanged`, `ProxyAdminOwnerChanged`, `AdminChanged`, `OwnershipTransferred`, any `Role…` on the permission contract | critical | Not your incident to fix, and nobody will have announced it. Within the hour: run pre-flight and the five-state tests against a fork at the new block, check `isAllowed` still answers for a known wallet, and read Redbelly's channels. If a gated call now behaves differently, pause and tell your users why |
| `CodeChanged`, `ImplementationCodeChanged` | critical | Code at an unchanged address should not change. Treat as the above, and write down both fingerprints |
| Poller `poll failed` for more than ten minutes | warning | RPC trouble; switch `--rpc` to another provider or let the fallback helper rotate, then check `/status` on the site |

## The five steps

1. **Confirm.** Open the transaction on Routescan (the alert carries the link). Read the block
   number and the sender. Check the timelock's pending operations and the Safe's transaction
   history: was this scheduled and executed by us? If yes, close the alert with the operation id.
   Ten minutes, no more; if you cannot confirm it was ours in ten minutes, it wasn't.

2. **Stop.** Send `pause()` from the pauser Safe. One transaction; blocks on Redbelly are produced
   on demand, so it lands in the next block anyone produces, usually within seconds. Confirm with
   `cast call <token> "paused()(bool)"` and write down the block number. Everything stops:
   transfers, mints, burns, forced transfers. Admin actions still work, and that is what step 3
   needs.

3. **Contain.** From the Safe that holds the relevant admin role, take away the lever that was
   misused: `revokeIssuer` for a rogue issuer (issuer admin, at once), `revokeRole` for a
   compromised operational role (that goes through the timelock; the token is paused while it
   waits). If the verifier is wrong, schedule `setVerifier` back to the right one. If the
   governance Safe itself is compromised, keep the token paused (the attacker needs the timelock
   to unpause, and the timelock needs its delay) and go to step 5 with lawyers.

4. **Tell people.** Holders see a paused token on Routescan before they see your message; get
   ahead of it. One paragraph: what happened as far as you know, that balances are unchanged,
   when the next update is. Regulators and the issuer's compliance officer get the same paragraph
   plus the block numbers.

5. **Recover and record.** Schedule the fix and the `unpause` as one timelock batch so they
   land together; execute after the delay; confirm `paused()` is false and read `isEligible` on a
   known-good and a known-bad wallet. Write the record: the alert, the blocks, every transaction
   hash, who decided what and when, and the one thing you will change so it does not happen
   again. Put the record next to this file.

## Commands the on-call needs

```
# Is it paused? Who is the verifier? What is the request id?
cast call $TOKEN "paused()(bool)" --rpc-url $RPC
cast call $TOKEN "verifier()(address)" --rpc-url $RPC
cast call $TOKEN "requestId()(uint64)" --rpc-url $RPC

# Who holds a role?
cast call $TOKEN "hasRole(bytes32,address)(bool)" $(cast keccak PAUSER_ROLE) $ADDRESS --rpc-url $RPC

# Pending timelock operations (the OperationScheduled events):
node scripts/alert.mjs --contract $TIMELOCK --rpc $RPC --once --dry-run --from-block <block>

# Recent transfers, holders, and whether the source is what you deployed:
node scripts/routescan-transfers.mjs $TOKEN --network mainnet --limit 50
node scripts/routescan-holders.mjs $TOKEN --network mainnet
node scripts/routescan-verified.mjs $TOKEN --network mainnet --expect-name GatedERC20 --expect-compiler 0.8.30

# Match a forced transfer's hash to the document you were given:
cast keccak-file court-order.pdf
```

Signing is always through the Safe (its web app or transaction builder, or `cast` with a
hardware wallet against the Safe contract). No script in this kit signs anything and no private
key exists on the on-call machine.

## The drill

Quarterly, on testnet, with the real signers: raise a fake alert (a forced transfer you make
yourself with a hash nobody can match), run steps 1 to 5 against the clock, record how long each
took, and fix whatever was slow. The example next to this file is one such drill.

## Fill in once

| What | Value |
|---|---|
| Token address (151) | |
| Timelock address and delay | |
| Governance Safe (owners, threshold) | |
| Pauser Safe or key (owners, threshold) | |
| Compliance Safe (owners, threshold) | |
| Issuer admin Safe | |
| Verifier address and who deployed it | |
| Alert channel and who watches it | |
| On-call rota | |
| Regulator contact | |
| Where the deployment record and this runbook live | |
| Last drill date and time-to-pause | |
