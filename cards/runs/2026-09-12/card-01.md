# Card 1, Change the gate: run of 2026-09-12

## Verdict

Verified. The result compiles, the five-state tests pass (30 tests in four suites, unchanged in number), Slither finds nothing and pre-flight clears. Wall time 4 min 16 s from the first edit to the last pre-flight line, of which about three minutes went on a pre-flight failure that turned out to be a flaw in the tool (below). The card's wording has been changed; see the end.

Agent: Claude Code (this session), following the prompt exactly as written on the card, with the scaffold's own `CLAUDE.md` rules file loaded. A second agent has not run this card yet.
Scaffold: a fresh `create-redbelly-dapp --yes` gated-erc20 project at the state the golden path leaves it (`packages/create-redbelly-dapp/reports/golden-path-foundry.md`), copied into its own git repository so the diff is exact.
Tools: Foundry 1.7.1 (forge, cast, an Anvil fork of testnet at block 3034388), Slither 0.11.6, `redbelly-preflight` 0.1.0, git. No key, no wallet, nothing sent to a real network; pre-flight ran read-only against the fork with the known allowed address.

## The prompt, as written on the card

> Switch the gated function from the over-18 recipe to the AU wholesale investor recipe. Keep everything else. Run the five-state tests and show me the diff.

## What the agent did

Read `contracts/src/GatedERC20.sol`, the deploy script, the tests and `recipes/`. The gate is `Gated(verifier, requestId)`; which recipe it enforces is the request id the deploy passes, 18 for over-18 (`recipes/over-18`) and 708 for the AU wholesale investor recipe (`recipes/au-wholesale-investor`). Nothing in the contract body names a recipe, so "switch the recipe" means "bind a different request id and say so": the deploy script's default, the Hardhat deploy script's default, `.env.example`, the README line that tells you how to mark a test wallet Valid, one comment on the contract, and the unit test's `REQUEST` constant so the tests read as the contract's binding. No gate was touched. The invariant and fuzz suites keep their own arbitrary ids on purpose: they prove the gate for any id.

One thing did not go to plan. After the edit, `redbelly-preflight` failed its Slither freshness check although Slither had just been re-run: the report has no findings, so the re-run wrote byte-identical JSON, git recorded no change, and the check's commit-time rule could never call it fresh again. That is a flaw in the tool, not in the card, and it was fixed the same day in `packages/preflight` (a `slither.sources.sha256` sidecar decides freshness by content) and in the scaffolder (`npm run lint:slither` writes the report and the sidecar). The transcript shows the run after that fix. The `package.json` and `scripts/slither.mjs` entries in `git status` at the end are that scaffolder fix carried into the copy; the card's own diff is the six files in the stat.

## Transcript

### The diff

```
$ git diff --cached --stat
.env.example                    | 6 +++---
 README.md                       | 6 +++---
 contracts/script/Deploy.s.sol   | 6 +++---
 contracts/src/GatedERC20.sol    | 3 +++
 contracts/test/GatedERC20.t.sol | 3 ++-
 hardhat/scripts/deploy.ts       | 2 +-
 6 files changed, 15 insertions(+), 11 deletions(-)
```

exit 0, 0.01 s wall.

### The diff, in full

```
$ git diff --cached
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
diff --git a/README.md b/README.md
index 7ebcfc7..84fbe16 100644
--- a/README.md
+++ b/README.md
@@ -83,9 +83,9 @@ https://access.redbelly.network, fund it from https://redbelly.faucetme.pro/, th
 | `cd contracts && forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account deployer --broadcast` | `cd hardhat && npm run keystore:set` once, then `npm run deploy:testnet` |
 
 Without `VERIFIER` set, the script deploys a `ReceptorMock` as the verifier and says so in
-capitals. Every wallet starts ineligible on it; call `setStatus(wallet, 18, Valid)` from the
-deployer to let a test wallet through (18 is the request id of the over-18 recipe, the default
-`REQUEST_ID`; the AU wholesale investor recipe is 708). Replace it with your own verifier (a
+capitals. Every wallet starts ineligible on it; call `setStatus(wallet, 708, Valid)` from the
+deployer to let a test wallet through (708 is the request id of the AU wholesale investor recipe,
+the default `REQUEST_ID`; the over-18 recipe is 18). Replace it with your own verifier (a
 `ZKPVerifier` or `VCVerifierBaseContract` child, see docs.redbelly.network) before anything
 real. The deployment record lands in `contracts/deployments/153-GatedERC20.json`.
 
diff --git a/contracts/script/Deploy.s.sol b/contracts/script/Deploy.s.sol
index de177e6..398eb79 100644
--- a/contracts/script/Deploy.s.sol
+++ b/contracts/script/Deploy.s.sol
@@ -15,8 +15,8 @@ import { ReceptorMock } from "@redbelly-builder/receptor-mock/ReceptorMock.sol";
 ///   VERIFIER     Your dApp's verifier contract. Required on 151. On 153 and local chains a
 ///                ReceptorMock is deployed when unset, so the first deploy works before you
 ///                have a real verifier; the log says so in capitals.
-///   REQUEST_ID   The eligibility request id your verifier answers for. Default 18, the
-///                over-18 recipe (recipes/over-18); the AU wholesale recipe is 708.
+///   REQUEST_ID   The eligibility request id your verifier answers for. Default 708, the
+///                AU wholesale investor recipe (recipes/au-wholesale-investor); over-18 is 18.
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
diff --git a/contracts/src/GatedERC20.sol b/contracts/src/GatedERC20.sol
index 2bd87b6..5aaa68b 100644
--- a/contracts/src/GatedERC20.sol
+++ b/contracts/src/GatedERC20.sol
@@ -13,6 +13,9 @@ import { IRedbellyVerifier } from "@redbelly-builder/receptor-mock/IRedbellyVeri
 /// on-chain justification, and the admin can pause. Admin roles belong to a Safe from the
 /// first testnet deploy so mainnet changes nothing.
 ///
+/// Eligibility: every holder proves the AU wholesale investor recipe (recipes/au-wholesale-investor,
+/// request id 708 at deploy time). Which recipe is a deploy-time choice; the gate is the same.
+///
 /// Revocation policy: a holder whose credential lapses keeps the balance but cannot send or
 /// receive. The compliance officer moves it with `forceTransfer`. Change this only after
 /// writing the decision down in THREAT-MODEL.md.
diff --git a/contracts/test/GatedERC20.t.sol b/contracts/test/GatedERC20.t.sol
index f1b36cc..b316d9e 100644
--- a/contracts/test/GatedERC20.t.sol
+++ b/contracts/test/GatedERC20.t.sol
@@ -14,7 +14,8 @@ import { GatedERC20 } from "../src/GatedERC20.sol";
 /// a transfer. A gate with fewer than five states is untested.
 contract GatedERC20Test is GatedTest {
     GatedERC20 internal token;
-    uint64 internal constant REQUEST = 1;
+    /// The request id the deploy script binds: 708, the AU wholesale investor recipe.
+    uint64 internal constant REQUEST = 708;
     address internal admin = makeAddr("admin");
     address internal alice = makeAddr("alice");
     address internal bob = makeAddr("bob");
diff --git a/hardhat/scripts/deploy.ts b/hardhat/scripts/deploy.ts
index 39d631d..b0f1dd3 100644
--- a/hardhat/scripts/deploy.ts
+++ b/hardhat/scripts/deploy.ts
@@ -59,7 +59,7 @@ async function main() {
   }
 
   let verifier = process.env.VERIFIER ? getAddress(process.env.VERIFIER) : undefined;
-  const requestId = BigInt(process.env.REQUEST_ID ?? "18"); // 18 = the over-18 recipe (recipes/over-18); AU wholesale is 708
+  const requestId = BigInt(process.env.REQUEST_ID ?? "708"); // 708 = the AU wholesale investor recipe (recipes/au-wholesale-investor); over-18 is 18
   if (!verifier) {
     if (chainId === MAINNET) throw new Error("VERIFIER is not set; mainnet never deploys a mock verifier");
     console.log("VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet.");
```

exit 0, 0.01 s wall.

### forge fmt --check

```
$ forge fmt --check

```

exit 0, 0.02 s wall.

### forge test (five-state tests are in GatedERC20Test; the fuzz and invariant suites run too)

```
$ forge test
Ran 9 tests for test/DeployPreflight.t.sol:DeployPreflightTest
[PASS] test_mainnet_accepts_safe_with_threshold_two_and_verified_deployer() (gas: 255518)
[PASS] test_mainnet_refuses_eoa_admin() (gas: 62817)
[PASS] test_mainnet_refuses_threshold_one() (gas: 255291)
[PASS] test_mainnet_refuses_unverified_deployer() (gas: 231044)
[PASS] test_mainnet_refuses_without_admin_safe() (gas: 55366)
[PASS] test_mainnet_refuses_wrong_version_or_singleton() (gas: 468805)
[PASS] test_other_chain_skips_identity() (gas: 20188)
[PASS] test_redbelly_refuses_when_registry_missing() (gas: 17649)
[PASS] test_testnet_allows_eoa_admin_but_still_checks_identity() (gas: 71627)
Suite result: ok. 9 passed; 0 failed; 0 skipped; finished in 2.20ms (1.38ms CPU time)
Ran 14 tests for test/GatedERC20.t.sol:GatedERC20Test
[PASS] test_forceTransfer_movesFromRevokedHolder_withJustification() (gas: 184322)
[PASS] test_forceTransfer_recipientRevertsInAllInvalidStates() (gas: 197779)
[PASS] test_forceTransfer_requiresJustification_andRole() (gas: 166116)
[PASS] test_mint_revertsForIneligibleRecipient() (gas: 95004)
[PASS] test_mint_valid_and_onlyMinter() (gas: 112192)
[PASS] test_pause_blocksEverythingButUnpause() (gas: 213641)
[PASS] test_setVerifierAndRequestId_onlyAdmin() (gas: 38807)
[PASS] test_subscribe_closed() (gas: 60130)
[PASS] test_subscribe_revertsInAllInvalidStates() (gas: 181345)
[PASS] test_subscribe_valid() (gas: 133630)
[PASS] test_transferFrom_checksRealParties() (gas: 221842)
[PASS] test_transfer_bothPartiesInAllFiveStates() (gas: 351424)
[PASS] test_transfer_bothValid() (gas: 184549)
[PASS] test_transfer_recipientRevertsInAllInvalidStates() (gas: 197328)
Suite result: ok. 14 passed; 0 failed; 0 skipped; finished in 4.13ms (3.27ms CPU time)
Ran 3 tests for test/GatedERC20.fuzz.t.sol:GatedERC20FuzzTest
[PASS] testFuzz_forceTransfer_alwaysNeedsJustification(uint256,string) (runs: 512, μ: 185980, ~: 187984)
[PASS] testFuzz_subscribe_onlyValidOnce(address,uint8) (runs: 512, μ: 66878, ~: 50451)
[PASS] testFuzz_transfer_requiresBothValid(address,address,uint8,uint8,uint256) (runs: 512, μ: 160489, ~: 158894)
Suite result: ok. 3 passed; 0 failed; 0 skipped; finished in 728.87ms (841.39ms CPU time)
Ran 4 tests for test/GatedERC20.invariants.t.sol:GatedERC20Invariants
[PASS] invariant_forcedTransfersEmitJustification() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_noIneligibleRecipient() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_pausedMeansNoStateChange() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_supplyEqualsSumOfBalances() (runs: 64, calls: 2048, reverts: 0)
Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 729.07ms (1.72s CPU time)
Ran 4 test suites in 730.62ms (1.46s CPU time): 30 tests passed, 0 failed, 0 skipped (30 total tests)
```

exit 0, 4.02 s wall.

### Slither on the changed sources, through the scaffold's lint:slither (writes the JSON report and the sources hash pre-flight compares)

```
$ bash -c 'npm run lint:slither 2>&1 | grep -E 'analyzed|result|wrote''
. analyzed (16 contracts with 81 detectors), 0 result(s) found
wrote contracts/reports/slither.json and contracts/reports/slither.sources.sha256
```

exit 0, 1.47 s wall.

### redbelly-preflight, read-only, against the testnet fork

```
$ cd contracts && redbelly-preflight --chain 153 --rpc http://127.0.0.1:8545 --address 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
redbelly-preflight 0.1.0  project <tmp>/card-01/contracts
chain 153 (testnet) via http://127.0.0.1:8545  deployer 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76

pass  chain-id           --chain says chain 153 and the RPC reports 153.
pass  deployer-verified  0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 (--address) passes permission.isAllowed on chain 153.
skip  admin-safe         No admin given; pass --admin <0x…> with the address that will own the deployed contracts.
pass  compiler-pins      <tmp>/card-01/contracts/foundry.toml (profile default) pins solc 0.8.30 and EVM prague.
pass  git-secrets        No secret-shaped line added in 1 commits, and no .env file is tracked.
pass  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 279.7464 RBNT; 3,000,000 gas costs about 90.6243 RBNT (US$0.2203) and 113.2804 RBNT covers it with 25% margin.
pass  slither-report     reports/slither.json describes the current sources: reports/slither.sources.sha256 matches the hash of 1 .sol file(s) under src.

ok: no check failed.
```

exit 0, 0.26 s wall.

## Wording change

The card said "switch the gated function from the over-18 recipe". Before this run the scaffold's gate was bound to request id 1, which stood for no recipe at all, so the prompt referred to something that was not there. The scaffolder now binds the over-18 recipe by default (id 18), and the card says what the swap is: "Switch the gated function from the over-18 recipe (request id 18) to the AU wholesale investor recipe (708). Keep everything else. Run the five-state tests and show me the diff." The change is in `site/src/data/cards.ts` and in PLAN.md section 16's log; the plan's original wording in section 14.2 stays as history.
