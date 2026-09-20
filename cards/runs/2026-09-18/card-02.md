# Card 2, Prove the pause, the agent track: run of 2026-09-18 on the reworded prompt

## Verdict

Verified. The prompt was reworded (the owner's decision of 18 September 2026) and a reworded prompt
is an unrun prompt, so it was run before the site changed. The result compiles, `forge fmt --check`
is clean, the five-state tests pass with the rest of the suite (69 tests in 8 suites, up from the
scaffold's 63 in 7), and pre-flight clears 9 of 9. Nothing under `contracts/src/` changed. Wall time
43 s from the first edit to the last green run of the whole suite. Nothing was signed or sent to a
real network; pre-flight read testnet and nothing else.

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1. Project: a fresh scaffold made the same hour
with `create-redbelly-dapp my-app --yes` (Foundry only, web app, gated ERC-20), committed as the
baseline before the card began. Slither and Aderyn are not installed on this machine and were not
run; the card changes tests only, so there is no new source for them to read.

## The prompt, as run

> The token already pauses. Prove it: show that only the pauser can pause and only the admin can
> unpause, that every flip emits an event, and add an invariant test that nothing the token holds
> changes while paused, including through mint.

The earlier wording was "show that only the admin Safe can flip the pause". The contract kit split
the roles after that was written: `pause()` is `onlyRole(PAUSER_ROLE)` and `unpause()` is
`onlyRole(DEFAULT_ADMIN_ROLE)`, because stopping must be fast and restarting must be slow. The old
sentence held only while one Safe held both roles, which is the deploy script's default and not the
design. The 17 September by-hand run found this and left the prompt alone; this run is the rewording.

## What the agent did

Read `contracts/src/GatedERC20.sol`, the scaffold's `GatedERC20.t.sol` (whose `setUp` already gives
the two roles to two accounts) and the invariant handler. Tests only:

1. A new file, `contracts/test/PauseRoles.t.sol` (beside this record), four tests with the roles
   held apart. Only the pauser can pause: the admin and a stranger are each refused with
   `AccessControlUnauthorizedAccount` naming `PAUSER_ROLE`. Only the admin can unpause: the pauser,
   who stopped the token, is refused when it tries to restart it, and so is a stranger. Every flip
   emits, naming the account: `Paused(pauser)` then `Unpaused(admin)`. And a fixed scenario: a
   snapshot at the pause, then a transfer, a subscription, a mint by the issuer and a forced transfer
   by the compliance officer, each reverting with `EnforcedPause`, the snapshot unchanged, and the
   mint succeeding once the admin resumes.
2. The invariant the prompt asks for, added to the scaffold's fuzz handler
   (`invariants.diff` beside this record). When a pause lands the handler records total supply and
   every actor's balance and subscription flag; `invariant_pausedStateFrozen` compares the live
   token against that record for as long as the pause lasts. It compares state rather than counting
   calls, so it would catch a change made by a path the handler forgot to count. Mint, distribute,
   subscribe, transfer, burn and forceTransfer are all in the handler's call set. It runs in both
   derived suites: 64 runs, 2,048 calls each, 0 reverts.

The first draft put the "nothing changes" proof in the fixed scenario alone. The prompt says
"invariant test", and a scenario is not one, so the handler change followed. Both stayed: the
scenario reads well and names the mint path; the invariant is the proof.

## Do the tests bite?

Two mutations of `GatedERC20.sol`, each restored afterwards (`git diff -- src` empty, 69 green):

| Mutation | Caught by |
|---|---|
| `pause()` also accepts `DEFAULT_ADMIN_ROLE` | `test_onlyThePauserCanPause`: "next call did not revert as expected" |
| `_update` skips the pause check when minting (`from == address(0)`) | `invariant_pausedStateFrozen` in both suites ("assertion failed") and `test_nothingMovesWhilePaused_includingThroughMint` |

## Commands

| Command | Result |
|---|---|
| `npm run contracts:install` | forge-std v1.16.2 and OpenZeppelin, 1.9 s |
| `forge test` (baseline, before the card) | 63 tests passed in 7 suites, 2.7 s |
| `forge fmt --check` | exit 0, prints nothing |
| `forge test --match-contract PauseRolesTest` | 4 passed, 0 failed, 0.86 s |
| `forge test --match-test invariant_pausedStateFrozen` | PASS twice, runs 64, calls 2,048, reverts 0 |
| `forge test` | 69 tests passed in 8 suites, 1.3 s |
| `npm install` at the project root | 32.7 s (needed before pre-flight; the golden path's install step) |
| `npm run preflight` | 9 of 9, read-only against 153 with the known allowed address as `DEPLOYER`: chain id 153, deployer passes `isAllowed`, 380.53 RBNT |

## What the run found in the tool

Pre-flight first failed 5 of 7, and one failure was the tool's own: "no 64-hex-character value (a
private key shape) in tracked files: recipes/business-delegate/README.md, recipe.json". The recipes
had been vendored into scaffolds that same day, and the business-delegate recipe prints two role
hashes. The scaffold's script treated any `0x` value of 64 hex characters as a key shape. It now lets
one kind through, by proof: a line that states its own preimage, `keccak256("X")`, beside a value
that really is keccak256 of X. Checked three ways on this scaffold: the recipes pass; a bare key
shape in a tracked file still fails; a key shape dressed with a false preimage still fails. The
pre-flight package's own scanner was already contextual and needed no change. The other first-run
failure was `DEPLOYER` unset, which is the wallet's and not the code's.
