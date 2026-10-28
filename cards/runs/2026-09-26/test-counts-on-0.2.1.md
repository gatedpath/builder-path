# Run record: the test counts the project pages print, measured on scaffolder 0.2.1

Run on 26 September 2026 at 11:10 UTC on macOS: Node 24.20.0, `forge` 1.7.1, `create-redbelly-dapp`
0.2.1 from the public npm registry. The site audit of the same morning found three counts that had
been worked out for 0.2.1 rather than measured (project 2's 71 and 75, project 5's 85, the kit's 53).
This run measured them.

## What ran

1. `npm create redbelly-dapp@latest p2 -- --yes`, `npm install`, `npm run contracts:install`
   (forge-std v1.16.2). Baseline `npm test`: **68 tests passed, 0 failed across 7 suites**.
2. Project 2, fresh: `contracts/test/PauseProof.t.sol` from `cards/runs/2026-09-17/card-02-solidity/`
   copied in. `npm test`: **71 tests passed, 0 failed across 8 suites**.
3. Project 5, on a fresh scaffold: the four files from `cards/runs/2026-09-18/card-05/`
   (`TokenisedBond.sol`, `TokenisedBond.t.sol`, `mocks/MockStable.sol`, `DeployBond.s.sol`) copied
   in, project 2's test removed first. `npm test`: **85 tests passed, 0 failed across 8 suites**.
4. Project 1 then project 2, carried on: project 5's files removed; `WholesaleGate.t.sol` from
   `cards/runs/2026-09-17/card-01-solidity/` copied in and the deploy script's default request id
   set to 708; `PauseProof.t.sol` back in. `npm test`: **75 tests passed, 0 failed across 9 suites**.
5. The contract kit, `packages/contract-kit` at 0.2.1: `forge test`: **53 tests passed, 0 failed
   across 6 suites**.

Every count the pages printed was right; what was missing was the run behind it. The whole run took
45 seconds of wall time after the scaffold's install. No wallet, and no network beyond npm and the
forge-std clone.
