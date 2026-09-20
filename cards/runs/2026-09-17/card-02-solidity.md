# Card 2, Prove the pause, the Solidity track: run of 2026-09-17

## Verdict

Verified by hand, with no agent. One new test file, `contracts/test/PauseProof.t.sol` (beside this
record), three tests, all passing on the first run; `forge fmt --check` clean; the full suite green.
Nothing under `contracts/src/` changed, as in the agent's run of 12 September: the pause exists, and
the card is about proving it. Nothing was signed or sent anywhere.

Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1. Project: the same fresh scaffold as
`card-01-solidity.md`, continued, so the count before this card was 67 (63 from the scaffold and 4
from card 1) and 70 after. On a scaffold that skipped card 1 the figures are 63 and 66.

## What reading the contract showed

`pause()` is `onlyRole(PAUSER_ROLE)` and `unpause()` is `onlyRole(DEFAULT_ADMIN_ROLE)`. They are
different roles on purpose (stopping is fast, restarting is slow), and the scaffold's own
`test_pause_blocksEverythingButUnpause_andRolesSplit` shows the admin being refused when it tries to
pause. **So the card's sentence "only the admin Safe can flip the pause" is true only when one Safe
holds both roles, which is the deploy script's default (`PAUSER` falls back to `ADMIN_SAFE`).** The
contract kit split the roles after the card was worded. The prompt has not been changed, because a
changed prompt is an unrun prompt; the project page says this beside it.

What the scaffold already proves: every mover reverts with `EnforcedPause` while paused, the roles
are split, and `invariant_noTransferWhilePaused` holds over 2,048 random calls. What it leaves
unproven, and this file adds: each flip emits its event with the account that made it
(`Paused(pauser)`, `Unpaused(admin)`); a stranger can neither pause nor unpause; and a snapshot of
total supply, both balances and the subscription flag taken at the pause is unchanged after alice,
bob, the issuer (mint) and the compliance officer (forced transfer) have each tried to move something.

## Commands

| Command | Result |
|---|---|
| `cd contracts && forge fmt --check test/PauseProof.t.sol` | exit 0, prints nothing |
| `forge test --match-contract PauseProofTest` | `Suite result: ok. 3 passed; 0 failed; 0 skipped` |
| `npm run test` | `70 tests passed, 0 failed` across 9 suites |
| `git commit` | `8d68f68`, one file |
