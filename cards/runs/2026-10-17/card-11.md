# Card 11, Fractional property, the agent track: run of 2026-10-17

## Verdict

Proven on a fork of testnet, and not further, and the ship report was not produced. Three new
contracts under one gate, `PropertyUnits` (ERC-1155 units with a balance history, 187 lines),
`RentDistributor` (169 lines) and `SaleVote` (185 lines), all bound to request 708 (the AU wholesale
investor recipe) on one verifier, with a 48-hour `TimelockController` as the admin of each and the
Safe's seat on the operational roles, the way the kit's own `AdminPattern.t.sol` wires its token.
Everything compiles under the scaffold's strict linter with no warning (`deny = "warnings"` never
fired), `forge fmt --check` is clean, 104 tests pass in 11 suites (the default template's 68 and 36
new ones, one of them a fuzz over three holders' units and a rent amount), pre-flight clears 6 of 7
(the one failure is `DEPLOYER is a public address`, which the shared step says to expect before a
wallet is set), and the vehicle's whole life was rehearsed on a local fork of testnet against the
seeded accounts in eleven steps: 20 transactions mined, 14 refusals, each the right one, two
`RentClaimed` events read from the log. Slither and Aderyn were run; nothing in the three contracts
needed a change (finding 9).

The rehearsal did its job in the other direction too: its first run showed a transfer landing in the
same second as a sale proposal changing the proposal's weights, which none of the tests had caught.
The snapshot rule was changed, two tests were rewritten to do exactly what the fork did, and the
rehearsal was run again (finding 1).

Timings. The scaffold: `npm create redbelly-dapp@latest card-11 -- --yes` 0.27 s (the 0.2.1 tarball
was already in the npm cache), `npm install` 27 s, `npm run contracts:install` 2.9 s, `npm run test`
2.8 s for the baseline's 68 tests and 1.8 s for the 104 after. Baseline committed 17:18 local. The
three contracts were written and first compiled, clean, by 17:24 (about five minutes of writing).
The session was then cut off by a rate limit and resumed at 22:52; the tests, the deploy script and
the rehearsal script sit after that gap. From the resume to the first green commit of all three
contracts and their tests: 3 min 23 s (22:52:28 to 22:55:51). From there to the end of the first
rehearsal: 3 min (22:58:50). The fix for finding 1 was committed at 23:01. The second rehearsal
stalled (finding 10) and was abandoned at 23:11; the rehearsals that followed, on fresh forks, ran in
31 s, 25 s, 9 s and 21 s, and the transcript beside this record is the last of them (23:21:42 to
23:22:03). Pre-flight, Slither and Aderyn took 4 s between them.
Fork loop: ready in 23.3 s the first time (5.5 s of that forking testnet) and between 2.1 s and 22.6 s
on the five restarts after it, from the cached fork.

What the prompt asks for and this run did not do: the ship report. `npm run ship` refuses to start
without `--account <keystore-name>` (exit 2, its words are in `ship-output.txt` beside this record),
because the report carries the deployer's address and its `isAllowed` reading, and this machine has
no keystore and the agent creates none. That is the card's finish line and it waits for the owner's
wallet. Also not done, by the path's standard rather than the prompt: the testnet deploy and the
Routescan verification (both need a wallet-signed transaction), and a web page (the prompt names
none). The Safe itself is stood in for by an unlocked Anvil account (finding 3 says what the real
deploy uses). Nothing was signed or sent to a real network; the fork ran as chain 31337 and every
sender was an unlocked Anvil test account (indices 3, 7, 8 and 9 and, as refused parties, 2, 4, 5
and 6; never 0 or 1).

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1, Slither 0.11.6, Aderyn 0.6.8. Project: a
fresh scaffold made the same afternoon from the published packages, `npm create redbelly-dapp@latest
card-11 -- --yes` (the default `gated-erc20` template), `npm install`, `npm run contracts:install`,
committed as the baseline before the card began (68 tests green). The scaffold's own files are
untouched: `git diff --stat` against the baseline shows additions only, 10 files and 1,620 lines,
and `npm run dev` still deploys the template's `GatedERC20` exactly as shipped.

## Where the card comes from

Card 11 is the plan's property vehicle, the first "several contracts" card with a named recipe:
units can only ever sit in wallets that pass the wholesale gate, so the register of owners is a
register of eligible investors by construction. The card's page says it teaches more than one
contract under one gate, a timelock in front of admin, and the ship report as the finish line.

## The prompt, as run

> Build a property vehicle: an ERC-1155 of units, a rental income distributor, a governance vote on
> sale weighted by units, all gated to the AU wholesale recipe. Admin behind a Safe with a 48-hour
> timelock. Produce the ship report.

## What was built (files beside this record)

Three contracts, one gate. Each inherits the scaffold's `Gated` with the same verifier and request
id 708, so one `setZKPRequest` on a real verifier serves all three, and each one's
`_authorizeVerifierChange` is `onlyRole(DEFAULT_ADMIN_ROLE)`, the admin being the timelock.

`src/PropertyUnits.sol`, `ERC1155Supply`, `AccessControl`, `Gated`, `IERC6372`:

- One token id per property. `openProperty(id, totalUnits, termsHash)` (ISSUER_ROLE, a Safe) fixes
  the unit count and the keccak256 of the offer document; `issue(id, to, amount)` mints up to that
  count into one eligible wallet, `gatedFor(to)` on the signature so the rule is in the ABI.
- The gate on every movement: `_update` runs `_requireEligible` on the real sender and the real
  recipient (never an approved operator) for mint, transfer and batch transfer; a batch is capped at
  `MAX_BATCH` (8) ids so the only loop has a ceiling the caller cannot raise.
- Holding: a holder whose credential lapses keeps the units but cannot send or receive, the position
  the scaffold's token takes; the distributor and the vote run the gate again before paying or
  counting that wallet.
- A balance history. Every balance change pushes an OpenZeppelin `Checkpoints.Trace208` per
  (property, holder) and per property total, keyed by `block.timestamp` (`CLOCK_MODE` is
  `mode=timestamp`). `getPastUnits(id, holder, t)` and `getPastTotalUnits(id, t)` answer "who held
  what at t" for the two contracts beside it, so neither needs a loop over holders or a hook back
  into the register.

`src/RentDistributor.sol`, `AccessControl`, `Gated`:

- `deposit(propertyId, amount)` (MANAGER_ROLE, a Safe) takes the stablecoin by `safeTransferFrom`
  and records a round: amount, the snapshot (the last closed second, `clock() - 1`) and the units in
  existence then. `claim(roundId)`, `gated`, pays the caller `amount * unitsHeldAtSnapshot /
  totalUnits`, once; a wallet that held nothing at the snapshot is refused `NothingToClaim`.
- Dust: every share rounds down; `unclaimed(round)` says what is left, and once everyone has pulled
  that is the dust. Nothing moves it. The threat model should name the plain-stablecoin assumption
  (a fee-on-transfer coin would make the figure wrong; USDC-style coins do not do this).

`src/SaleVote.sol`, `AccessControl`, `Gated`:

- `propose(propertyId, termsHash, votingPeriod)` (PROPOSER_ROLE, a Safe) records the hash of the
  sale terms, the snapshot (the last closed second) and a deadline `votingPeriod` seconds out, one to
  ninety days. `castVote(proposalId, support)`, `gated`, counts the units the caller held at the
  snapshot, once per wallet; zero units is refused.
- `state()` is Active until the deadline, then Passed when the units for are more than half of every
  unit in existence at the snapshot, else Defeated. A sale is a decision of the whole register, not
  of whoever turned up; the exact half fails.
- Timestamps, not blocks, for both the snapshot and the deadline (finding 2).

Also `script/DeployProperty.s.sol` (the scaffold's pre-flight, then a `TimelockController` with a
48-hour minimum delay whose only proposer and executor is the Safe's seat and whose admin is
`address(0)`, then the three contracts with the timelock as admin; reads `ADMIN_SAFE`, `TIMELOCK`,
`VERIFIER`, `STABLE`, `REQUEST_ID` defaulting to 708 and `UNITS_URI`, all public values; off
mainnet it deploys a `ReceptorMock` and a `MockStable` when those are unset and says so in capitals;
mainnet refuses without them), `test/PropertyUnits.t.sol` (11 tests), `test/RentDistributor.t.sol`
(11, one a fuzz), `test/SaleVote.t.sol` (9), `test/PropertyAdminPattern.t.sol` (5),
`test/mocks/MockStable.sol` (six decimals; tests and rehearsal only) and `scripts/rehearse-property.sh`.
The outputs beside this record: `test-output.txt` (the 104), `rehearsal-output.txt`,
`dev-loop-output.txt` (every start of the loop, six in all), `preflight-output.txt`, `ship-output.txt`,
`slither-findings.txt` and `aderyn-report.md`.

The tests, in the shape the scaffold asks for. Mint: the recipient in the four refused states and the
Valid one minted. Transfer: `assertGatedPair` on `safeTransferFrom`, both parties, both directions;
an approved operator with no credential moves units between two eligible wallets. Hold: a
credential set with `setValidUntil` and lapsed with `vm.warp` freezes the units in place. The
balance history read at three past moments and refused for the present one. Claim and castVote
through `assertRevertsForAllInvalidStates`. Arithmetic: 500/300/200 units sharing 10,000 mUSD
exactly; three holders of one unit sharing 100 smallest units, 33 each and 1 of dust left in the
contract; a zero holder refused; a buyer in the deposit's own second getting nothing while the
seller keeps the share; two rounds on two properties not mixing; a fuzz over units and amount
asserting the claims never exceed the deposit and the dust is below one smallest unit per holder.
The vote: 600 for against 400 passes; 400 for against 600 fails; 400 for with 600 silent fails;
500 of 1,000 fails; units moved in the proposal's own second carry no vote and the seller still
votes with hers. Admin: the deployer holds nothing; the Safe cannot call `setRequestId` directly;
scheduled on the timelock, execution is refused at once and at 47 h 59 min and lands at 48 h, on
each of the three contracts; operational roles act without delay; a stranger can schedule nothing and
the Safe cannot shorten the delay.

## What the run found

**1. A snapshot "at the moment of the proposal" is a whole second, and the first rehearsal proved
it.** With the snapshot set to `clock()` at `propose`, a transfer mined in the same second (Anvil
puts each `cast send` in its own block, but two blocks can share a timestamp; Redbelly puts several
transactions in one on-demand block, which is the same thing) overwrote the checkpoint for that
second, and the receiving holder voted with 600 units rather than the 500 she held when the proposal
was made. The tests had not caught it because every test warped one second between the proposal and
the transfer. It was not a double count (the sender's checkpoint for that second fell to 400, the
total stayed 1,000), but it was not what the contract promised either. The fix is to snapshot the
last closed second, `clock() - 1`, which nothing after the proposal or the deposit can alter; the
`Pending` state and the `RoundNotOpen` refusal then had no reason to exist and were removed, and
voting and claiming open at once. Two tests now do the transfer in the proposal's or deposit's own
second, on purpose. The cost: units issued in the same second as a proposal or a deposit are not in
its total; the tests pin that too. A rehearsal on a fork is cheap and it found what a unit suite
written by the same hand did not.

**2. Blocks on demand make a block clock useless here.** The usual governor measures a voting period
in blocks. Redbelly makes a block only when there is a transaction, so a deadline in blocks would
never arrive on a quiet day and would arrive in minutes on a busy one. All three contracts use the
timestamp clock (ERC-6372 `mode=timestamp`), and the record of who held what is keyed by timestamp
too. Worth a line on the card's page: on this chain, time is the only clock.

**3. "Admin behind a Safe with a 48-hour timelock" has a local stand-in, and the record must say
what the real deploy uses.** The kit provides no Safe mock; its `AdminPattern.t.sol` puts a plain
address under `vm.prank` in the Safe's seat (what a Safe does is sign, and signing is not under
test) and a real OpenZeppelin `TimelockController` behind it. This run did the same in its tests
and on the fork, with Anvil account 9 as the Safe's seat: the timelock's only proposer and executor,
and the issuer, manager and proposer roles. The deploy script reads `ADMIN_SAFE` for that seat; on a
real deploy it is a Safe 1.4.1 with threshold two or more, which the scaffold's pre-flight verifies
by bytecode and singleton on 151 and reports on 153. The script says in the log, every time the seat
is not a Safe, what the real one is. The timelock itself is real code in both places; only the
signer changes.

**4. A snapshot history on an ERC-1155 is the piece the standard does not give you, and it is
small.** ERC-20 has `ERC20Votes`; ERC-1155 has nothing. Twelve lines in `_update` push an OpenZeppelin
`Checkpoints.Trace208` per (property, holder) and per property total, and the distributor and the
vote read them. Without it the distributor would need the holder list handed in by the caller (a loop
whose bound the caller controls, which the rules forbid) or a hook from the register into the
distributor (a circular constructor dependency). With it both contracts are pull-based and loop-free,
and a third contract (a buy-back, a second vote type) could read the same history. The card's page
could name this as the lesson under "more than one contract under one gate".

**5. The gate runs before the body, so a refused wallet is refused for eligibility first.** A test
expecting `UnknownProperty` for an issue into an ineligible wallet got `NotEligible`: `gatedFor(to)`
is a modifier and runs before any check in the function. Right, and worth knowing when reading a
revert: the recipe's answer comes first.

**6. Two Foundry traps in the tests, neither in the contracts.** An external call inside the
arguments to `vm.expectRevert` (a `units.ISSUER_ROLE()` read, a `units.clock()` read) consumed the
`vm.prank` or the expectation, so the real call ran from the test contract or was not expected to
revert. Reading into a local first fixed both. Card 6's finding 4, met twice more.

**7. "Stack too deep" in the deploy script, not the contracts.** Three contracts, their constructor
arguments and three deployment records in one `run()` exceeded the stack. Moving the records into a
helper that takes one struct fixed it without `via_ir`. A several-contracts deploy script should start
that way.

**8. Pre-flight's secret scanner reads shell scripts too, and `bytes32(0)` is 64 hex zeros.** With
the rehearsal output already outside the tree (card 9's finding 4), pre-flight still failed 5 of 7:
the rehearsal script passed the timelock's predecessor as a literal `0x000...000`, 64 hex characters,
the shape of a key. `$(cast hash-zero)` in its place, 6 of 7. The scanner is right to be blunt; a
zero literal is the one 64-hex value that is provably not a key, and the preflight package could
allow it.

**9. Static analysis has nothing on the three contracts that needs a change.** Slither's five results
on them: three `unused-return` on `Checkpoints.push` (it returns the previous and new values;
`ERC20Votes` discards them the same way) and two `timestamp` on the `FutureLookup` comparisons,
which are the clock's own rule. Aderyn's one High, "state change after external call", names six
places where `units.clock()` or `units.getPast*` is read before storage is written; those are `view`
calls on an immutable contract of our own, made as staticcalls, and a staticcall cannot re-enter.
The lows are the pattern itself (centralisation on the roles, the bounded loop in `_update`, the
empty `_authorizeVerifierChange` body, the unchecked `_grantRole` return) and `setURI` without an
event of its own (`ERC1155._setURI` emits none; one could be added). Both reports are beside this
record.

**10. The fork is cheap to start and worth starting fresh, because four different things went wrong
on reused ones.** First, after the first rehearsal had moved the fork's clock sixteen days ahead with
`evm_increaseTime`, the second rehearsal's deploy hung for ten minutes with two of its five
transactions mined while Anvil itself answered `eth_blockNumber` throughout; it was killed and the
loop restarted. Second, two of the loop's restarts exited on their own, with code 0 (the loop's own
signal handler), between printing "ready" and the rehearsal's first call; starting the loop and the
rehearsal in one shell ended that. Third, on one run the issue of 400 units to Anvil 8 was mined with
status 0 and the rehearsal script, which read `cast send --json` as a receipt and nothing more,
carried on as if it had landed, so every later figure stood on 600 units instead of 1,000 and a
proposal passed that should have failed; a replay of the same three steps on a fresh fork did not
reproduce it and the reason is not known. The script now stops on a mined revert and prints `cast
run` of the transaction. Fourth, a `state()` read at `latest` after a seven-day `evm_increaseTime`
once came back `Active`: `eth_call` at `latest` runs against Anvil's pending block, whose clock is not
the block just mined. The script now names the mined block on every read after a time jump. None of
the four is a fault in the contracts, and the last transcript shows all eleven steps as designed; but
a rehearsal on a fork is a test of the fork as much as of the code, and the shared "how to repeat it"
step should say: one fresh fork per rehearsal, stop on a mined revert, read at the block you mined.

**11. Gas, for the page.** On the fork: `openProperty` 73,162; the first `issue` into a wallet
225,851 (two new checkpoint traces and the holder's zero-to-nonzero balance), the second 159,840;
`safeTransferFrom` 114,316; `deposit` 187,663; the first `claim` 127,301, the second 105,401;
`propose` 152,574; `castVote` 91,446; `schedule` on the timelock 56,626 and `execute` 49,986. At
Redbelly's dollar pricing (US$0.01 per 21,000 gas) the dearest of those is about eleven cents. Fees
on a fork mean nothing in RBNT; these are gas counts only.

**12. The ship report is the finish line the card names, and no agent can cross it.** `npm run ship`
needs a keystore name so that the report can carry the deployer's address and its `isAllowed`
reading; the agent has no keystore and makes none, and the command exits 2 before any check runs.
Everything it would check is checked here by other means (tests, Slither's sidecar, pre-flight), but
the document itself waits for the owner. The card's page should say so beside its verdict, or the
prompt's last sentence should read "ready for the ship report".

## The rehearsal, as it ran (`rehearsal-output.txt`)

Eleven steps on a fork of testnet (chain 31337, fork of 153 at block 3,052,529, the rehearsal starting
at 3,052,543 after the loop's own fourteen transactions), 20 transactions mined and 14 refusals,
every signer an unlocked Anvil account: the vehicle deployed through its script with the loop's seeded `ReceptorMock` as verifier,
Anvil 9 in the Safe's seat and a `MockStable` deployed on the fork, the three request ids read back
as 708, `CLOCK_MODE` as `mode=timestamp`, the timelock's delay as 172,800 s, the timelock the admin
of the units and the deployer not; property 1 opened with 1,000 units; Anvil 8 made Valid on the
mock and 600 units issued to Anvil 3, 400 to Anvil 8; issues into the Expired, Revoked,
WrongJurisdiction and NeverIssued wallets refused `NotEligible(wallet, 708)`; 100 units moved from
Anvil 3 to Anvil 8 and a move to the Revoked wallet refused; 10,000 mUSD deposited for property 1
and both holders' `claimable` read as 5,000 mUSD; Anvil 3 paid, Anvil 8 revoked on the mock and
refused, restored and paid, `unclaimed(1)` zero, a second claim refused `AlreadyClaimed`, both
`RentClaimed` events on the log with 500 units and 5,000,000,000 in their data; a sale proposed for
seven days, 500 for and 500 against, a second vote refused `AlreadyVoted`, the Revoked wallet
refused at the gate, and after the deadline `Defeated` with 500/500 of 1,000 in the proposal; a
second proposal with 100 units moved from Anvil 8 to Anvil 3 in the proposal's own second, Anvil 3
voting with 500, not 600, and `Defeated`; the Safe's seat refused `setRequestId` directly, the change
scheduled on the timelock, execution refused at once and at 47 h 59 min
(`TimelockUnexpectedOperationState`), landed at 48 h with `requestId()` reading 18, a stranger's
schedule refused; and with the gate now on request 18, which no seeded wallet holds, Anvil 3's
transfer refused `NotEligible(wallet, 18)` and her 600 units still in place.

## Not done

- **The ship report.** The prompt's last sentence. `npm run ship` exits 2 without a keystore
  (`ship-output.txt`); finding 12. The owner runs `npm run ship -- --chain 153 --account <keystore-name>`
  on the project at `~/code/card-11`.
- **Testnet deploy and Routescan verification.** The path's standard. The deploy script is ready;
  `ADMIN_SAFE` (the Safe), `STABLE` (the real stablecoin) and `VERIFIER` are the values to set.
- **A real verifier.** The gate ran on `ReceptorMock`. The AU wholesale recipe is a draft with seven
  `verify` markers until a run against a live verifier on 153 with the Eligibility SDK, which needs a
  GitHub Packages token and a verifier API key an agent cannot obtain (`recipes/README.md`).
- **A web page.** The prompt names none; the web app was not touched, so `typecheck` and `build`
  were not run for this card.
- **A second agent.** The plan asks for two.
- **The hand-written project page and the terminal recording.**
- **Small things the analysers suggest** (an event on `setURI`, a threat-model line on plain
  stablecoins) and a decision on what the vehicle does after a sale passes: this run records the
  decision on chain and stops; moving the proceeds is a card of its own.

## How to repeat it

```
mkdir -p ~/code && cd ~/code
npm create redbelly-dapp@latest card-11 -- --yes
cd card-11 && npm install && npm run contracts:install
git init && git add -A && git commit -m baseline
# add the ten files beside this record where their names say:
#   contracts/src/PropertyUnits.sol  contracts/src/RentDistributor.sol  contracts/src/SaleVote.sol
#   contracts/script/DeployProperty.s.sol  contracts/test/mocks/MockStable.sol
#   contracts/test/PropertyUnits.t.sol  contracts/test/RentDistributor.t.sol
#   contracts/test/SaleVote.t.sol  contracts/test/PropertyAdminPattern.t.sol  scripts/rehearse-property.sh
npm run test                                   # 104 tests, 11 suites
(cd contracts && forge fmt --check src script test)
npm run dev -- --no-web --port 8551 --request-id 708   # one fresh fork per rehearsal (finding 10); leave it running
bash scripts/rehearse-property.sh > ../card-11-rehearsal-output.txt   # outside the tree: card 9's finding 4; stops on a mined revert
npm run preflight                              # 6 of 7; DEPLOYER is the expected failure
npm run ship -- --chain 153                    # exits 2 without --account; the owner's keystore crosses this line
```
