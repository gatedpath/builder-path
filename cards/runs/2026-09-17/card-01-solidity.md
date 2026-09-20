# Card 1, Change the gate, the Solidity track: run of 2026-09-17

## Verdict

Verified by hand, with no agent. The change compiles, `forge fmt --check` is clean, the full suite
passes (67 tests in eight suites: the scaffold's 63 in seven, plus four new ones), pre-flight passes
six of seven with the seventh being the wallet it has no business having yet, and the local loop
deploys the token on a fork of testnet with `requestId` 708, read back from the contract with
`cast call`. Nothing was signed, broadcast or sent to a real network.

This is the first time the card has been done without an agent. It exists because the project page
for this card offers a "Writing Solidity" track, and nothing is published that was not executed.

Who: Claude Code acting as the developer, typing the change by hand from a reading of the code; no
prompt card was given to an agent. Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1.
Scaffold: a fresh `create-redbelly-dapp gate-demo --yes` (Foundry only, 59 files) from the
scaffolder at repository commit e5f0734.

## What a developer has to notice

The recipe is not code in the contract. `GatedERC20` takes `requestId` as a constructor argument and
passes it to `Gated(verifier, requestId)`; which credential the gate asks for is decided at deploy
time. So nothing in `contracts/src/` changes. Found with one search for `REQUEST_ID` and `requestId`:
the default lives in `contracts/script/Deploy.s.sol` (`vm.envOr("REQUEST_ID", uint256(18))`) and in
`.env.example`. The work worth doing is the proof: a test that the gate now asks about 708 and about
nothing else, in all five credential states, including the case a careless change would miss, a
wallet that holds a valid over-18 credential and must be refused.

## Steps, with wall times

| Step | Command | Result | Time |
|---|---|---|---|
| Scaffold | `create-redbelly-dapp gate-demo --yes` | 59 files | under 1 s |
| Install | `npm install` | exit 0 | 45 s |
| Contract libraries | `npm run contracts:install` | forge-std v1.16.2 | 2 s |
| Baseline | `npm run test` | 63 tests, 7 suites, 0 failed | 3 s |
| Baseline commit | `git init`, `git add -A`, `git commit` | `fb2ee87` | under 1 s |
| Find the id | one `grep` for `REQUEST_ID` and `requestId` | two places to change | under 1 s |
| Change | `Deploy.s.sol` default 18 to 708 with its comment; `.env.example` the same | 12 lines | by hand |
| Prove | new `contracts/test/WholesaleGate.t.sol`, four tests | file beside this record | by hand |
| Format | `forge fmt --check` | exit 0 | under 1 s |
| New tests | `forge test --match-contract WholesaleGateTest` | 4 passed | 1 s |
| Everything | `npm run test` | 67 tests, 8 suites, 0 failed | 1 s |
| Pre-flight | `npm run preflight` | 6 of 7; fails only `DEPLOYER is a public address` | under 1 s |
| Local loop | `node scripts/dev.mjs --no-web --json` | chain 31337 forked from 153, `requestId` 708, five wallets in five states | about 20 s |
| Ask the contract | `cast call <token> 'requestId()(uint64)' --rpc-url http://127.0.0.1:8545` | `708` | under 1 s |
| Commit | `git commit` | `ea541f5`, 3 files, 80 insertions, 6 deletions | under 1 s |

Not done, and said so on the page: the README's example flags were not reworded (the agent run of
14 September did that; a developer may or may not), Slither was not run (not installed on this
machine), the web panel was not opened (the agent track's record of 14 September covers it), and
no deploy to testnet, which is wallet-signed and has not been made yet.

## The four tests

`test_gateIsTheWholesaleRecipe`: the deployed token reports 708.
`test_over18Credential_doesNotOpenTheWholesaleGate`: a wallet Valid for 18 calls `subscribe()` and
reverts with `NotEligible(alice, 708)`.
`test_everyInvalidState_isRefused_thenValidSubscribes`: NeverIssued, Expired, Revoked and
WrongJurisdiction each revert for 708; Valid then subscribes and holds 100 tokens.
`test_revokedAfterSubscribing_isRefusedNextTime`: valid, subscribes, is revoked, and the next gated
call reverts.

## The diff outside the new test

```
diff --git a/.env.example b/.env.example
index ea1a35d..382b6ba 100644
--- a/.env.example
+++ b/.env.example
@@ -10,9 +10,9 @@ ADMIN_SAFE=
 # child). Required on 151. Leave empty on 153 to deploy a ReceptorMock for the first run.
 VERIFIER=
 
-# The eligibility request id your verifier answers for. 18 is the over-18 recipe
-# (recipes/over-18/), 708 the AU wholesale investor recipe; any uint64 works on the mock.
-REQUEST_ID=18
+# The eligibility request id your verifier answers for. 708 is the AU wholesale investor
+# recipe (recipes/au-wholesale-investor/), 18 the over-18 recipe; any uint64 works on the mock.
+REQUEST_ID=708
 
 # Public address of the wallet you deploy from, used by `npm run preflight` to check
 # permission.isAllowed and the RBNT balance before you sign anything.
diff --git a/contracts/script/Deploy.s.sol b/contracts/script/Deploy.s.sol
index fff7b87..cd8c3d0 100644
--- a/contracts/script/Deploy.s.sol
+++ b/contracts/script/Deploy.s.sol
@@ -15,8 +15,8 @@ import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";
 ///   VERIFIER     Your dApp's verifier contract. Required on 151. On 153 and local chains a
 ///                ReceptorMock is deployed when unset, so the first deploy works before you
 ///                have a real verifier; the log says so in capitals.
-///   REQUEST_ID   The eligibility request id your verifier answers for. Default 18, the
-///                over-18 recipe (recipes/over-18); the AU wholesale recipe is 708.
+///   REQUEST_ID   The eligibility request id your verifier answers for. Default 708, the AU
+///                wholesale investor recipe (recipes/au-wholesale-investor); over-18 is 18.
 ///
 /// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
 ///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
@@ -26,7 +26,7 @@ contract Deploy is RedbellyDeployScript {
         Preflight memory p = preflight();
 
         address verifier = optionalEnvAddress("VERIFIER");
-        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(18)));
+        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(708)));
         if (verifier == address(0)) {
             if (p.chainId == Redbelly.MAINNET_CHAIN_ID) {
                 revert("VERIFIER is not set; mainnet never deploys a mock verifier");
```
