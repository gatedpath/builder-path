# Card 5, Tokenised bond, the agent track: run of 2026-09-18

## Verdict

Proven on a fork of testnet, and not further. The contract compiles under the scaffold's strict
linter, `forge fmt --check` is clean, 79 tests pass in 8 suites (the scaffold's 63 and 16 new ones,
with every gated function walked through the five credential states), pre-flight clears 9 of 9, and
the bond's whole life was rehearsed on a local fork of testnet with every refusal the right one.
Wall time 8 min 33 s from the first edit to the last check.

**What the prompt asks for and this run did not do:** the deploy to testnet and the verification on
Routescan. Both need a wallet-signed transaction, and this project has not made one on a real network
yet. The card therefore says "proven on a fork"
beside its date, and the project page marks those two steps pending. Nothing was signed or sent to
a real network; the fork ran as chain 31337 and every sender was an unlocked Anvil test account
(index 2, 3 and 7; never 0 or 1).

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1. Project: a fresh scaffold made the same hour
with `create-redbelly-dapp bond --yes`, committed as the baseline before the card began (63 tests
green). Slither and Aderyn are not installed on this machine and were not run, which matters more
here than on card 2 because this run adds a contract; see "Not done" below.

## The prompt, as run

> Build a fixed-coupon bond token: issuer mints to eligible AU wholesale investors, coupons paid in a
> stablecoin on a schedule, transfers only between eligible holders, forced transfer with on-chain
> justification for the compliance role. Testnet. Five-state tests on every gated function,
> pre-flight clean, verified on Routescan.

## What was built (files beside this record)

`src/TokenisedBond.sol`, 193 lines, `TokenisedBond is GatedERC20`. The gate, the issuer allowance,
the compliance role's forced transfer with its justification hash, and the pause are inherited
unchanged; the bond is bound to request id 708, the AU wholesale investor recipe. It adds:

- a schedule fixed at deployment: `couponPerUnit` stablecoin base units per whole unit, the first
  coupon's due time, the period, and how many coupons there are;
- `payCoupon()`, for a `PAYING_AGENT_ROLE` kept apart from the admin. The amount is computed from the
  supply at that moment, never passed in; refused before the due time, after the last coupon, while
  paused, and when no units exist. A coupon paid late does not bring the next one forward;
- `claimCoupons()`, gated like every other action. A holder whose credential lapses keeps what it
  accrued: the amount waits and is claimable once the wallet is eligible again;
- the accounting, in an `_update` override that calls `super._update` first (the eligibility check
  and the pause) and then records a correction, so a unit earns only the coupons funded while its
  holder held it. A buyer after a coupon does not receive it; a seller after a coupon keeps it; a
  forced transfer leaves earned coupons with the wallet that held the units then. No loop over
  holders anywhere, because the review page treats an unbounded loop as fatal.

Also `script/DeployBond.s.sol` (the scaffold's pre-flight, then the bond; a mock verifier off
mainnet, and a mock stablecoin on a local chain only, each announced in capitals),
`test/TokenisedBond.t.sol` (16 tests), `test/mocks/MockStable.sol` (six decimals, tests only) and
`scripts/rehearse-bond.sh`.

Out of scope on purpose, and said so in the contract: redemption of principal, day-count
conventions, partial periods. The card asks for a fixed coupon on a schedule.

## What the run found

**1. The kit's token could not be extended.** Coupon accounting has to see every balance change,
and `GatedERC20._update` was not `virtual`; nothing in the contract was. The handover's note that
this card "needs only the token the scaffold has" was true only once that one word was added to
`packages/contract-kit/src/GatedERC20.sol`, with a comment that an override must call
`super._update` first. The kit's 51 tests pass unchanged; the only `forge snapshot --check`
difference is one fuzz test's mean. Done before the scaffold for this run was made.

**2. The first accounting was wrong by one base unit, and then by more.** The first draft divided
each coupon by the supply into a 2^128 accumulator and multiplied back, the usual dividend pattern.
Five tests failed on `249999999 != 250000000`: a holder of ten whole units was paid 249.999999. For
a fixed coupon the division is unnecessary, so the accumulator now rises by exactly `couponPerUnit`
per coupon and a holder of whole units is owed an exact amount. Working that through exposed a
second fault in the same draft: funding rounded down and claims round down, so the sum owed could
exceed the sum funded by dust and the last claimant would be refused. Funding now rounds up
(`Math.mulDiv(..., Ceil)`), so every coupon brings in at least what it creates in claims. The fuzz
test asserts owed <= funded, bounds the dust, and then makes every holder actually claim.

**3. The strict linter earned its keep.** The scaffold denies lint warnings. It refused the draft's
three unchecked `int256`/`uint256` casts in money arithmetic; they are `SafeCast` now, which reverts
instead of wrapping. The one `block.timestamp` comparison carries an inline justification, as the
kit's own does: a coupon date is days away, and a validator's seconds of drift cannot matter.

**4. Two test faults of the agent's own**, fixed: the fuzz test's paying agent was underfunded for
the largest supply, and a test that meant to reach `EmptyJustification` named a revoked recipient, so
the gate refused first.

## Do the tests bite?

Four mutations of `TokenisedBond.sol`, each restored afterwards:

| Mutation | Caught by |
|---|---|
| Funding rounds down instead of up | `testFuzz_owedNeverExceedsFunded`: "owed more than was funded: the last claimant would be refused: 2909 > 2908" |
| The correction for the recipient of a transfer is dropped | `test_coupons_followTheUnitsHeldWhenEachWasFunded`, `test_coupons_aForcedTransferLeavesEarnedCouponsBehind`, and the fuzz test |
| `claimCoupons` loses its `gated` modifier | `test_claimCoupons_inAllFiveStates` ("call succeeded while ... was NeverIssued") and `test_coupons_aLapsedHolderWaits_andLosesNothing` |
| The due-time check is removed | `test_payCoupon_notBeforeItsDueTime` and `test_payCoupon_aLateCouponDoesNotBringTheNextOneForward` |

The fourth was first applied in a way that left an unused variable, which the linter refused to
compile, so no test ran and nothing was reported; it was re-applied so that it compiled.

## The rehearsal on a fork (`scripts/rehearse-bond.sh`, 3.9 s)

Fork of testnet at block 3037532, running as chain 31337.

| Step | Result |
|---|---|
| Deploy with no `VERIFIER` and no `STABLECOIN` | both mocks deployed and announced in capitals; bond at `0x76ca03a67C049477FfB09694dFeF00416dB69746` on the fork |
| Mint 10 units to an investor with no credential | refused, `NotEligible(wallet, 708)` |
| The mock marks the investor Valid for 708; the same mint | ok, investor holds 10 units |
| The investor passes a unit to a wallet with no credential | refused, `NotEligible(wallet, 708)` |
| Coupon 1, ninety days early | refused, `CouponNotDue(number, dueAt)` |
| The fork's clock moves 90 days; coupon 1 | costs 250000000 (250.000000), ok, investor can claim 250000000 |
| The investor claims | investor holds 250000000 of the stablecoin, 0 left in the bond |
| Coupon 2 straight away | refused, `CouponNotDue(number, dueAt)` |
| The credential is revoked; the investor tries to move a unit | refused, `NotEligible(wallet, 708)` |

The two selectors were checked with `cast sig`: `0x879342fb` is `NotEligible(address,uint64)` and
`0xf667d948` is `CouponNotDue(uint32,uint64)`. An earlier attempt at this rehearsal is not the one
recorded: its harness ran under zsh, which did not split a flags variable, so every `cast send`
failed while the clock-moving calls succeeded, and a second pass on the same fork then saw two
coupons due. The contract behaved correctly throughout; the record is the clean run on a fresh fork.

## Commands

| Command | Result |
|---|---|
| `forge test` (baseline, before the card) | 63 tests passed in 7 suites |
| `forge build` | refused at first by the linter (3 unsafe casts, 1 timestamp comparison); clean after |
| `forge fmt --check` | exit 0 |
| `forge test --match-contract TokenisedBondTest` | 16 passed; the fuzz test 512 runs |
| `forge test` | 79 tests passed in 8 suites |
| `forge script script/DeployBond.s.sol --rpc-url <fork> --sender <anvil 7> --unlocked --broadcast` | `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`, 4.4 s, on the fork only |
| `bash scripts/rehearse-bond.sh` | the table above |
| `npm run preflight` | 9 of 9, read-only against 153 with the known allowed address as `DEPLOYER` |

## Not done, and why

- **Testnet deploy and Routescan verification**: wallet-signed, not made yet.
- **Slither and Aderyn**: not installed on this machine. This run adds 193 lines of contract that
  no static analyser has read. Before this bond is more than a worked example, run both and triage
  what they say. The scaffold's `npm run preflight` has no static-analysis check among its nine, so
  it cleared without one; the standalone pre-flight CLI does check for a Slither report.
- **A real stablecoin**: the rehearsal used `MockStable`. Which stablecoin exists on 153 is not
  recorded in RESEARCH.md; the deploy script therefore refuses 153 without `STABLECOIN` set.
- **A second agent.**

## Added after review, the same night

Two design limits the run did not test and the page now states. A coupon is earned by whoever holds
the units when it is funded, not when it falls due: a late paying agent moves a coupon from a seller
to a buyer, where a real bond would fix a record date. And `totalFunded` records the amount asked
for, not the amount received, so a stablecoin that takes a fee on transfer would leave the bond
short. Neither changes what was run; both are the first things to change if this goes further.

## Re-run after review, the same night

The review asked for one change to the contract: `couponDueAt` now refuses a number outside the
schedule by name, `NoSuchCoupon(number)`, where zero used to panic on the subtraction. One test was
added for it. Re-run on a fresh scaffold: `forge fmt --check` clean, `80 tests passed, 0 failed` in
8 suites (17 new), the guard removed as a mutation and caught
(`panic: arithmetic underflow or overflow (0x11) != NoSuchCoupon(0)`), and the fork rehearsal
unchanged line for line. The contract is 196 lines. Every figure of 79 tests, sixteen new tests or
193 lines above this section is the state before this change.
