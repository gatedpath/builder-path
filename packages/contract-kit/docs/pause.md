# Pause

OpenZeppelin's `ERC20Pausable` with the two halves of the switch given to different roles.

## Fast to stop, slow to start

`pause()` needs `PAUSER_ROLE`. `unpause()` needs `DEFAULT_ADMIN_ROLE`. In the admin pattern the
pauser is a Safe (or, if you accept the risk, a single hot key held by whoever is on call) and the
admin is a timelock the Safe proposes to. So stopping the token is one signed transaction that takes
effect in the next block, and starting it again takes the timelock's delay, two days on mainnet by
default, during which anyone watching the timelock can see the unpause coming and object.

That asymmetry is the whole design. An attacker who gets one pauser key can annoy you; an attacker
who wants to unpause into a bad state has to get through the Safe's threshold and then wait out the
delay in public.

## What pause blocks

Every path through `_update`: transfers, `transferFrom`, `subscribe`, `burn`, `mint`, `distribute`
and `forceTransfer`. The `can*` views return false while paused so a UI does not offer a button that
will fail. Pause does not block: `pause` itself (idempotence is refused by OpenZeppelin with
`EnforcedPause`), role changes, `setVerifier`, `setRequestId`, `setSubscriptionsOpen`, `setIssuer`,
`revokeIssuer`. Those are admin actions you may need while paused, and none of them moves a token.

Forced transfers are blocked too. If compliance needs to move tokens during an incident, the
timelock unpauses first, or the admin schedules the forced transfer and the unpause together as one
timelock batch. Keeping the invariant "paused means no balance changes" simple was worth more than
the convenience.

## Redbelly specifics

Blocks are produced on demand (RESEARCH.md question 4), so a pause transaction lands in the next
block anyone produces, usually within seconds. There is no mempool to watch for a race between your
pause and an attacker's transfer, and no priority fee to outbid with; the ordering inside a super
block is deterministic and not documented (question 5, still open with Redbelly). Plan for the pause
to land a few seconds after you send it and for one more block of transfers to possibly precede it.

## Tests and invariants

`test_pause_blocksEverythingButUnpause_andRolesSplit` walks every blocked path and both role
refusals (admin cannot pause, pauser cannot unpause). `invariant_noTransferWhilePaused` holds
across random sequences that pause and unpause at random. `AdminPattern.t.sol` shows the pause from
the Safe landing at once and the unpause refused until the timelock delay has passed.

## Rehearse it

The operations runbook has a pause drill. Run it on testnet before mainnet and once a quarter
after: who signs, from where, how long from alert to paused block, who tells the holders.
