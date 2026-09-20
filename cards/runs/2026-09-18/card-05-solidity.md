# Card 5, Tokenised bond, the Solidity track: the page followed literally, 2026-09-18

## Verdict

Verified, to the same point as the agent track: proven on a fork of testnet, and not further. The
"Writing Solidity" tab of `/tutorials/tokenised-bond/` was followed step by step on a second fresh
scaffold, with no agent writing anything: the four files the tab names were taken from
`cards/runs/2026-09-18/card-05/` as the page directs, and every command on the page was run as
written. Everything the page says will happen, happened. 41 s end to end, package installation
included. Nothing was signed or sent to a real network.

This run exists because a project page ships a track only when that track has been run on a fresh
scaffold (PLAN.md section 19.2). It checks the page, not the design; the design was tested in the
agent track's run (`card-05.md`), including the four mutations.

Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1.

## The steps, and what each produced

| Page step | Command or action | Result |
|---|---|---|
| 1 | `create-redbelly-dapp bond --yes`, `npm install`, `npm run contracts:install`, first commit | baseline `63 tests passed, 0 failed` in 7 suites |
| 3 | add `src/TokenisedBond.sol`, `test/TokenisedBond.t.sol`, `test/mocks/MockStable.sol`, `script/DeployBond.s.sol` | `git status`: 0 scaffold files changed, as the page promises |
| 3 | `cd contracts && forge fmt --check` | prints nothing, exit 0 |
| 3 | `npm run test` | `79 tests passed, 0 failed` across 8 suites |
| 4 | `bash scripts/rehearse-bond.sh` | five refusals and four successes in the page's order: `NotEligible(wallet, 708)` on the uncredentialled mint; the mint lands once Valid, 10 units; `NotEligible` on the transfer to an outsider; `CouponNotDue` ninety days early; coupon 1 costs 250000000 and the investor claims 250000000, 0 left in the bond; `CouponNotDue` on coupon 2; `NotEligible` once revoked |
| 5 | `npm run preflight` | `6 of 7 checks passed`; the one failure is `DEPLOYER is a public address`, which is what the shared step says to expect |

## Not done

The same list as `card-05.md`: the testnet deploy and Routescan verification (wallet-signed, not
made yet), Slither and Aderyn (not installed on this machine), a real stablecoin.

## Re-run after review, the same night

The review asked for one change to the contract: `couponDueAt` now refuses a number outside the
schedule by name, `NoSuchCoupon(number)`, where zero used to panic on the subtraction. One test was
added for it. Re-run on a fresh scaffold: `forge fmt --check` clean, `80 tests passed, 0 failed` in
8 suites (17 new), the guard removed as a mutation and caught
(`panic: arithmetic underflow or overflow (0x11) != NoSuchCoupon(0)`), and the fork rehearsal
unchanged line for line. The contract is 196 lines. Every figure of 79 tests, sixteen new tests or
193 lines above this section is the state before this change.
