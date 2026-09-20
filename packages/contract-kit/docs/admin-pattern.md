# Safe plus timelock admin pattern

Who holds which role, why, and what happens at three in the morning.

## The layout

```
                 proposes, executes after delay
  Safe A (2 of 3) ─────────────────────────────▶ TimelockController ──▶ DEFAULT_ADMIN_ROLE
  (the governance Safe)                          (2 days on mainnet)        unpause
                                                                            setVerifier, setRequestId
                                                                            setSubscriptionsOpen
                                                                            grantRole, revokeRole

  Safe A or a smaller Safe B ──▶ PAUSER_ROLE        pause, at once
  Safe C (compliance signers) ──▶ COMPLIANCE_ROLE   forceTransfer, at once
  Safe A or Safe D ─────────────▶ ISSUER_ADMIN_ROLE setIssuer, revokeIssuer, at once
  Business delegate wallets ────▶ issuer permissions (time-boxed, see issuer-registry.md)

  Deployer EOA ──▶ nothing, after the deploy transaction
```

`script/Deploy.s.sol` wires exactly this from environment variables that are all public addresses:
`ADMIN_SAFE` is the timelock's only proposer and executor; `PAUSER`, `COMPLIANCE` and
`ISSUER_ADMIN` default to it and can be other Safes. The timelock's own admin is `address(0)`, so
its roles and delay can only change through an operation that went through it. On 151 the script
refuses an `ADMIN_SAFE` that is not a contract answering `VERSION()` `1.4.1` with a threshold of at
least two, refuses a mock verifier, and refuses a delay under one day. The scaffolder's project adds
the rest of the pre-flight (the deployer passes `permission.isAllowed`, the Safe sits on a canonical
1.4.1 singleton whose bytecode hash was read from both networks).

Safe 1.4.1 is deployed at its canonical addresses on both Redbelly networks (RESEARCH.md question
14). Whether the Safe web app supports chain 151 was not checked; the transaction builder or
`cast` against the Safe contract works regardless.

## Why split the roles this way

Slow things that change the rules go through the timelock: who is an admin, which verifier decides
eligibility, whether the token runs at all. Anyone can read the timelock's pending operations and
has two days to notice a change of verifier to a contract that says yes to everyone.

Fast things that respond to the world stay on Safes: pausing, moving a frozen balance under a court
order, giving a new delegate a week's mint allowance. Each is bounded on its own (pause can only
stop; a forced transfer needs an eligible recipient and a hash; an issuer permission is time-boxed)
so a compromised operational Safe cannot rewrite the token, only misuse one lever until the
governance Safe revokes it through the timelock.

## The emergency path

Something is wrong: a forced transfer nobody recognises, a verifier that started saying yes to
strangers, an issuer minting at three in the morning.

1. Whoever is on call sends `pause()` from the pauser Safe. One transaction, next block. Every
   movement stops. Confirm with `paused()` and note the block number.
2. Revoke the lever that was misused, from the Safe that holds the admin for it, at once: `revokeIssuer`
   for a rogue issuer, `revokeRole(COMPLIANCE_ROLE, x)` if the compliance role itself is compromised
   (that one goes through the timelock; while it waits, the token is paused, so nothing can move).
3. Schedule the fix on the timelock: `setVerifier` to a good one, `revokeRole`, `grantRole` to a new
   Safe, and the `unpause`, as one batch so they land together. Two days on mainnet.
4. Tell holders. The pause is visible on Routescan; say why and when.
5. Execute the batch after the delay. Confirm `paused()` is false, run a read of `isEligible` on a
   known-good and a known-bad wallet, and close the incident with the block numbers in the record.

If the governance Safe itself is the thing compromised, the timelock delay is your two days to get
a court order or to migrate: the compliance Safe can still `forceTransfer` (once unpaused, which the
attacker also has to wait for) and the pauser can keep the token paused indefinitely, since unpause
needs the timelock and the timelock needs the delay. Nothing in this pattern lets one key act alone
and at once on anything that changes the rules. Rehearse steps 1 to 5 on testnet with the real
signers before mainnet; the ops kit's runbook has the drill and a filled-in example.

## What the tests prove

`test/AdminPattern.t.sol` deploys the layout the script deploys and shows: the deployer holds no
role on either contract; the Safe cannot unpause or change the request id directly; a scheduled
operation cannot execute before the delay and can be cancelled before it; after the delay it
executes; a role granted through the timelock then acts at once; a stranger can neither propose nor
pause; and the delay cannot be shortened except through the timelock. The Safe is stood in for by an
address under `vm.prank` because what a Safe adds is signatures, and signatures are not what is
under test.
